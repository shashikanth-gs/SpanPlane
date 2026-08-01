import type { SidebandEvent, TelemetrySpan } from "@/shared/evidence/types";
import type { ProtocolStatusEvidence } from "@/lib/task-lifecycle";

export type ExecutionTimelineItem =
  | { kind: "sideband"; id: string; sourceTimestamp: string; event: SidebandEvent }
  | { kind: "telemetry"; id: string; sourceTimestamp: string; span: TelemetrySpan }
  | { kind: "a2a-status"; id: string; sourceTimestamp: string; status: ProtocolStatusEvidence };

function timestampValue(value: string | undefined) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

/**
 * Builds the execution timeline from producer timestamps. Collection or poll
 * time is intentionally excluded: delayed OTLP ingestion must not move a span
 * to the end of an execution that already happened.
 */
export function buildExecutionTimeline(sidebandEvents: SidebandEvent[], telemetrySpans: TelemetrySpan[], statusUpdates: ProtocolStatusEvidence[] = []): ExecutionTimelineItem[] {
  return [
    ...sidebandEvents.map((event, sourceOrder) => ({
      kind: "sideband" as const,
      id: `sideband:${event.id}`,
      sourceTimestamp: event.timestamp,
      event,
      sourceOrder,
    })),
    ...telemetrySpans.map((span, sourceOrder) => ({
      kind: "telemetry" as const,
      id: `span:${span.projectId}:${span.spanId}`,
      // A span occupies an interval. Its start is the causal placement point;
      // endTime is rendered separately as duration/completion information.
      sourceTimestamp: span.startTime ?? span.endTime ?? "",
      span,
      sourceOrder: sidebandEvents.length + sourceOrder,
    })),
    ...statusUpdates.map((status, sourceOrder) => ({
      kind: "a2a-status" as const,
      id: `status:${status.id}`,
      sourceTimestamp: status.timestamp,
      status,
      sourceOrder: sidebandEvents.length + telemetrySpans.length + sourceOrder,
    })),
  ].sort((left, right) => timestampValue(left.sourceTimestamp) - timestampValue(right.sourceTimestamp) || left.sourceOrder - right.sourceOrder)
    .map((item): ExecutionTimelineItem => item.kind === "sideband"
      ? { kind: item.kind, id: item.id, sourceTimestamp: item.sourceTimestamp, event: item.event }
      : item.kind === "telemetry"
        ? { kind: item.kind, id: item.id, sourceTimestamp: item.sourceTimestamp, span: item.span }
        : { kind: item.kind, id: item.id, sourceTimestamp: item.sourceTimestamp, status: item.status });
}
