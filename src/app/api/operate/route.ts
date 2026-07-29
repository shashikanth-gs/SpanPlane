import { NextResponse } from "next/server";
import { executeOperation, type OperationInput } from "@/lib/a2a-gateway";
import { apiError } from "@/lib/api-response";
import { readJsonRequest } from "@/lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    return NextResponse.json(await executeOperation(await readJsonRequest<OperationInput>(request)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
