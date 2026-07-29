import type { OperationInput } from "@/lib/a2a-gateway";
import type { WireEvent } from "@/lib/workbench-types";
import type { SidebandEvent } from "@/shared/evidence/types";
import { appendEvidence } from "./service";

const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;

function suppliedId(value: unknown) {
  return typeof value === "string" && SAFE_ID.test(value) ? value : crypto.randomUUID();
}

export function operationContext(input: OperationInput) {
  const traceId = crypto.randomUUID().replaceAll("-", "");
  const spanId = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  return {
    sessionId: suppliedId(input.sessionId),
    requestId: suppliedId(input.requestId),
    traceContext: { traceId, spanId, traceparent: `00-${traceId}-${spanId}-01` },
  };
}

export function safeOperationRequest(input: OperationInput) {
  return {
    action: input.action,
    connection: {
      cardUrl: input.connection.cardUrl,
      interfaceUrl: input.connection.interfaceUrl,
      protocolBinding: input.connection.protocolBinding,
      protocolVersion: input.connection.protocolVersion,
      timeoutMs: input.connection.timeoutMs,
      diagnosticMode: input.connection.diagnosticMode,
    },
    params: input.params,
  };
}

export function captureOperationRequest(input: OperationInput, context: { sessionId: string; requestId: string }) {
  return appendEvidence({ ...context, source: "a2a", direction: "outbound", kind: `operation.${input.action}`, data: safeOperationRequest(input), references: input.traceContext ? { traceId: input.traceContext.traceId, spanId: input.traceContext.spanId } : undefined });
}

export function captureA2AResponse(data: unknown, kind: string, context: { sessionId: string; requestId: string }) {
  return appendEvidence({ ...context, source: "a2a", direction: "inbound", kind, data });
}

export function captureWireEvents(events: WireEvent[], context: { sessionId: string; requestId: string }) {
  return Promise.all(events.map((event) => appendEvidence({
    ...context,
    source: "a2a",
    direction: event.phase === "request" ? "outbound" : "inbound",
    kind: `transport.${event.phase}`,
    data: event,
    timestamp: event.timestamp,
  })));
}

export function captureSidebandEvents(events: SidebandEvent[]) {
  return Promise.all(events.map((event) => appendEvidence({
    sessionId: event.sessionId,
    requestId: event.requestId,
    source: "sideband",
    direction: "inbound",
    kind: event.type,
    data: event,
    references: event.references,
    timestamp: event.timestamp,
  })));
}
