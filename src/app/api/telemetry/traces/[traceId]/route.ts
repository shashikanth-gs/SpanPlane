import { appendEvidence, listEvidence } from "@/server/evidence/service";
import { configuredTraceProvider } from "@/server/telemetry/phoenix-trace-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRACE_ID = /^[a-f0-9]{32}$/i;
const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;

export async function GET(request: Request, context: { params: Promise<{ traceId: string }> }) {
  const { traceId } = await context.params;
  if (!TRACE_ID.test(traceId)) return Response.json({ error: { message: "Invalid trace identifier." } }, { status: 400 });
  const provider = configuredTraceProvider();
  if (!provider) return Response.json({ error: { message: "No trace provider is configured." } }, { status: 503 });
  const parameters = new URL(request.url).searchParams;
  const sessionId = parameters.get("sessionId") ?? "";
  const requestId = parameters.get("requestId") ?? "";
  if (!SAFE_ID.test(sessionId) || !SAFE_ID.test(requestId)) return Response.json({ error: { message: "A valid session and request are required." } }, { status: 400 });
  try {
    const result = await provider.findTrace(traceId);
    const existing = new Set((await listEvidence(sessionId, ["otel"]))
      .map((record) => record.references?.spanId).filter(Boolean));
    await Promise.all(result.spans.filter((span) => !existing.has(span.spanId)).map((span) => appendEvidence({
      sessionId,
      requestId,
      source: "otel",
      direction: "inbound",
      kind: `span.${span.kind.toLowerCase()}`,
      data: span,
      references: { traceId: span.traceId, spanId: span.spanId },
      timestamp: span.startTime,
    })));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: { message: error instanceof Error ? error.message : "Unable to query telemetry." } }, { status: 502 });
  }
}
