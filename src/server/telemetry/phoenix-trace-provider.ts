import type { TelemetrySpan, TelemetryTraceResult } from "@/shared/evidence/types";
import type { TraceProvider } from "./trace-provider";

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);

interface PhoenixProject { id: string; name: string }

async function jsonRequest(url: string, apiKey?: string): Promise<JsonObject> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    signal: AbortSignal.timeout(7_500),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Phoenix API returned HTTP ${response.status}.`);
  const value: unknown = await response.json();
  if (!isObject(value)) throw new Error("Phoenix returned an invalid response.");
  return value;
}

function normalizeProject(value: unknown): PhoenixProject | undefined {
  if (!isObject(value) || typeof value.id !== "string") return undefined;
  return { id: value.id, name: typeof value.name === "string" ? value.name : value.id };
}

function normalizeSpan(value: unknown, project: PhoenixProject): TelemetrySpan | undefined {
  if (!isObject(value)) return undefined;
  const context = isObject(value.context) ? value.context : {};
  const traceId = String(context.trace_id ?? value.trace_id ?? "");
  const spanId = String(context.span_id ?? value.span_id ?? "");
  if (!traceId || !spanId) return undefined;
  return {
    id: String(value.id ?? `${project.id}:${spanId}`),
    projectId: project.id,
    projectName: project.name,
    traceId,
    spanId,
    parentSpanId: typeof value.parent_id === "string" && value.parent_id ? value.parent_id : undefined,
    name: String(value.name ?? "unnamed span"),
    kind: String(value.span_kind ?? "UNKNOWN"),
    statusCode: String(value.status_code ?? "UNSET"),
    statusMessage: typeof value.status_message === "string" && value.status_message ? value.status_message : undefined,
    startTime: typeof value.start_time === "string" ? value.start_time : undefined,
    endTime: typeof value.end_time === "string" ? value.end_time : undefined,
    attributes: isObject(value.attributes) ? value.attributes : {},
    events: Array.isArray(value.events) ? value.events : [],
    raw: value,
  };
}

export class PhoenixTraceProvider implements TraceProvider {
  readonly id = "phoenix" as const;
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async findTrace(traceId: string): Promise<TelemetryTraceResult> {
    const projectsResponse = await jsonRequest(`${this.baseUrl}/v1/projects?limit=100`, this.apiKey);
    const projects = (Array.isArray(projectsResponse.data) ? projectsResponse.data : []).map(normalizeProject).filter((value): value is PhoenixProject => Boolean(value));
    const results = await Promise.allSettled(projects.slice(0, 100).map(async (project) => {
      const url = `${this.baseUrl}/v1/projects/${encodeURIComponent(project.id)}/spans?trace_id=${encodeURIComponent(traceId)}&limit=250`;
      const response = await jsonRequest(url, this.apiKey);
      return (Array.isArray(response.data) ? response.data : []).map((span) => normalizeSpan(span, project)).filter((span): span is TelemetrySpan => Boolean(span));
    }));
    const spans = results.flatMap((result) => result.status === "fulfilled" ? result.value : [])
      .sort((left, right) => String(left.startTime).localeCompare(String(right.startTime)));
    return { traceId, spans, projectsScanned: projects.length, provider: "phoenix" };
  }
}

export function configuredTraceProvider(): TraceProvider | undefined {
  const baseUrl = process.env.A2A_PHOENIX_BASE_URL;
  return process.env.A2A_TELEMETRY_PROVIDER === "phoenix" && baseUrl
    ? new PhoenixTraceProvider(baseUrl, process.env.A2A_PHOENIX_API_KEY)
    : undefined;
}
