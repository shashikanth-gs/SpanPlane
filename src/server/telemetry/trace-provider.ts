import type { TelemetryTraceResult } from "@/shared/evidence/types";

export interface TraceProvider {
  readonly id: "phoenix";
  findTrace(traceId: string): Promise<TelemetryTraceResult>;
}
