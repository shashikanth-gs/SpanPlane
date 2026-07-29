import { NextResponse } from "next/server";
import { executeOperation, type OperationInput } from "@/lib/a2a-gateway";
import { apiError } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    return NextResponse.json(await executeOperation(await request.json() as OperationInput));
  } catch (error) {
    return apiError(error);
  }
}
