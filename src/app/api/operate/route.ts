import { NextResponse } from "next/server";
import { executeOperation, type OperationInput } from "@/lib/spanplane-gateway";
import { apiError } from "@/lib/api-response";
import { readJsonRequest } from "@/lib/request-guard";
import {
  captureA2AResponse, captureOperationRequest, captureSidebandEvents, captureWireEvents, operationContext,
} from "@/server/evidence/capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let context: ReturnType<typeof operationContext> | undefined;
  try {
    const supplied = await readJsonRequest<OperationInput>(request);
    context = operationContext(supplied);
    const input = { ...supplied, ...context };
    await captureOperationRequest(input, context);
    const result = await executeOperation(input);
    await Promise.all([
      captureA2AResponse(result.result, `operation.${input.action}.result`, context),
      captureWireEvents(result.telemetry, context),
      captureSidebandEvents(result.sidebandEvents ?? []),
    ]);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (context) await captureA2AResponse({ message: error instanceof Error ? error.message : "Operation failed." }, "operation.error", context).catch(() => undefined);
    return apiError(error);
  }
}
