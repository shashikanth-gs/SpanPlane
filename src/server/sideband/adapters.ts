import { normalizeParts } from "../../lib/content";
import type { EvidenceReferences, SidebandEvent, SidebandLevel } from "../../shared/evidence/types";

type JsonObject = Record<string, unknown>;

export const GENERIC_SIDEBAND_EXTENSION_URI = "urn:agent-observability:sideband-events:v1";
export const A2A_WRAPPER_TRACE_EXTENSION_URI = "urn:x-a2a:trace:v1";

export const BUILT_IN_SIDEBAND_EXTENSION_URIS = [
  GENERIC_SIDEBAND_EXTENSION_URI,
  A2A_WRAPPER_TRACE_EXTENSION_URI,
] as const;

const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function firstDataPart(artifact: JsonObject): JsonObject {
  const parts = Array.isArray(artifact.parts) ? artifact.parts : [];
  const part = parts.find((candidate) => isObject(candidate) && isObject(candidate.data));
  return isObject(part) && isObject(part.data) ? part.data : {};
}

function wrapperType(traceType: string, data: JsonObject): { type: string; title: string; level: SidebandLevel } {
  if (traceType === "trace.lifecycle") {
    const state = String(data.state ?? "event").toLowerCase();
    if (state === "started") return { type: "agent.started", title: "Agent execution started", level: "info" };
    if (state === "finished") return { type: "agent.finished", title: "Agent execution completed", level: "info" };
    if (state === "error") return { type: "agent.error", title: "Agent execution failed", level: "error" };
    return { type: `agent.${state}`, title: `Agent ${state}`, level: "info" };
  }
  if (traceType === "trace.mcp.start") return { type: "tool.started", title: "Tool invocation started", level: "info" };
  if (traceType === "trace.mcp") {
    const status = String(data.status ?? "completed").toLowerCase();
    if (["declined", "rejected", "blocked"].includes(status)) return { type: "tool.declined", title: "Tool invocation declined", level: "warning" };
    if (["error", "failed"].includes(status)) return { type: "tool.failed", title: "Tool invocation failed", level: "error" };
    return { type: "tool.completed", title: "Tool invocation completed", level: "info" };
  }
  if (traceType === "trace.thinking" || traceType === "trace.thought") return { type: "agent.thinking", title: "Agent reasoning summary", level: "debug" };
  if (traceType === "trace.decision") return { type: "agent.decision", title: "Agent decision", level: "info" };
  if (traceType === "trace.delegation") return { type: "agent.delegation", title: "Sub-agent delegation", level: "info" };
  return { type: traceType, title: traceType.replaceAll(/[._-]+/g, " "), level: "info" };
}

export interface ExtensionArtifactContext {
  sessionId: string;
  requestId: string;
  extensionUri: string;
  references: EvidenceReferences;
}

/**
 * Converts extension-contributed artifacts into the Workbench sideband model.
 * The a2a-wrapper adapter is deliberately explicit: its public trace URN and
 * trace artifact vocabulary are compatibility contracts, not inferred A2A core semantics.
 */
export function decodeExtensionArtifact(artifact: JsonObject, context: ExtensionArtifactContext): SidebandEvent | undefined {
  if (!Array.isArray(artifact.parts)) return undefined;
  const artifactId = typeof artifact.artifactId === "string" ? artifact.artifactId : crypto.randomUUID();
  const metadata = isObject(artifact.metadata) ? artifact.metadata : {};
  const data = firstDataPart(artifact);
  const traceType = String(metadata.traceType ?? artifact.name ?? "extension.artifact");
  const mapped = context.extensionUri === A2A_WRAPPER_TRACE_EXTENSION_URI
    ? wrapperType(traceType, data)
    : { type: traceType, title: traceType.replaceAll(/[._-]+/g, " "), level: "info" as const };
  const traceId = typeof data.trace_id === "string" ? data.trace_id : typeof data.traceId === "string" ? data.traceId : undefined;

  return {
    id: artifactId,
    sessionId: context.sessionId,
    requestId: context.requestId,
    timestamp: typeof metadata.timestamp === "string" ? metadata.timestamp : new Date().toISOString(),
    extensionUri: context.extensionUri,
    type: mapped.type,
    title: mapped.title,
    level: mapped.level,
    parts: normalizeParts(artifact.parts),
    metadata: {
      ...metadata,
      adapter: context.extensionUri === A2A_WRAPPER_TRACE_EXTENSION_URI ? "a2a-wrapper" : "generic-extension-artifact",
      traceType,
    },
    references: {
      ...context.references,
      artifactId,
      traceId: traceId ?? context.references.traceId,
    },
  };
}
