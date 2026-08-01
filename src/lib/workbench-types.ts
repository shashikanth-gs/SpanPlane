export type AuthConfig =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "apiKey"; name: string; value: string };

export interface ConnectionConfig {
  cardUrl: string;
  auth: AuthConfig;
  headers: Record<string, string>;
  interfaceUrl?: string;
  protocolBinding?: string;
  protocolVersion?: string;
  timeoutMs?: number;
  diagnosticMode?: boolean;
}

export type ComplianceSeverity = "error" | "warning" | "info";

export interface ComplianceIssue {
  id: string;
  severity: ComplianceSeverity;
  path: string;
  message: string;
  spec?: string;
}

export interface ComplianceReport {
  version: "1.0" | "0.3" | "unknown";
  score: number;
  counts: Record<ComplianceSeverity, number>;
  issues: ComplianceIssue[];
  passed: string[];
}

export interface WireEvent {
  id: string;
  timestamp: string;
  phase: "request" | "response" | "stream" | "error";
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface DiscoverResponse {
  resolvedCardUrl?: string;
  card: Record<string, unknown>;
  rawCard: Record<string, unknown>;
  report: ComplianceReport;
  telemetry: WireEvent[];
  latencyMs: number;
  sideband?: {
    advertisedUris: string[];
    negotiatedUris: string[];
  };
}

export type OperationAction =
  | "send"
  | "getTask"
  | "listTasks"
  | "cancelTask"
  | "extendedCard"
  | "createPushConfig"
  | "getPushConfig"
  | "listPushConfigs"
  | "deletePushConfig";

export interface OperationResponse {
  result: unknown;
  telemetry: WireEvent[];
  latencyMs: number;
  protocolVersion: string;
  transport: string;
  diagnostics?: ComplianceIssue[];
  sessionId?: string;
  requestId?: string;
  negotiatedExtensions?: string[];
  sidebandEvents?: import("@/shared/evidence/types").SidebandEvent[];
  traceId?: string;
}

export interface NormalizedPart {
  id: string;
  kind: "text" | "data" | "url" | "raw" | "unknown";
  value: unknown;
  mediaType: string;
  filename?: string;
  metadata?: Record<string, unknown>;
}

export interface AssembledArtifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: NormalizedPart[];
  complete: boolean;
  /** Number of protocol artifact snapshots/chunks merged into this view. */
  updateCount: number;
}
