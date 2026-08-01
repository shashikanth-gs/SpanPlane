import type { NormalizedPart } from "@/lib/workbench-types";

export type EvidenceSource = "a2a" | "sideband" | "otel" | "runtime";
export type EvidenceDirection = "inbound" | "outbound" | "internal";

export interface EvidenceReferences {
  contextId?: string;
  taskId?: string;
  messageId?: string;
  artifactId?: string;
  traceId?: string;
  spanId?: string;
}

export interface EvidenceRecord {
  id: string;
  sessionId: string;
  requestId: string;
  timestamp: string;
  source: EvidenceSource;
  direction: EvidenceDirection;
  kind: string;
  data: unknown;
  references?: EvidenceReferences;
}

export type SidebandLevel = "debug" | "info" | "warning" | "error";

export interface SidebandEvent {
  id: string;
  sessionId: string;
  requestId: string;
  timestamp: string;
  extensionUri: string;
  type: string;
  title: string;
  level: SidebandLevel;
  parts: NormalizedPart[];
  metadata?: Record<string, unknown>;
  references?: EvidenceReferences;
}

export interface RuntimePublicConfig {
  features: {
    rawEvidenceViews: boolean;
    richJsonViews: boolean;
  };
  sideband: {
    extensionUris: string[];
  };
  telemetry: {
    provider: "phoenix" | "none";
    status: "managed" | "external" | "unavailable" | "disabled";
    uiUrl?: string;
    otlpHttpEndpoint?: string;
    otlpGrpcEndpoint?: string;
  };
}

export interface TelemetrySpan {
  id: string;
  projectId: string;
  projectName: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  statusCode: string;
  statusMessage?: string;
  startTime?: string;
  endTime?: string;
  attributes: Record<string, unknown>;
  events: unknown[];
  raw: Record<string, unknown>;
}

export interface TelemetryTraceResult {
  traceId: string;
  spans: TelemetrySpan[];
  projectsScanned: number;
  provider: "phoenix";
}
