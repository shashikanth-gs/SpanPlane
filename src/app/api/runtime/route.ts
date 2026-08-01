import { NextResponse } from "next/server";
import { runtimePublicConfig } from "@/server/runtime/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(runtimePublicConfig(), { headers: { "Cache-Control": "no-store" } });
}
