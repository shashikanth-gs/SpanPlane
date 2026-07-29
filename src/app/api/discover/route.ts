import { NextResponse } from "next/server";
import { discoverAgent } from "@/lib/a2a-gateway";
import { apiError } from "@/lib/api-response";
import type { ConnectionConfig, DiscoverResponse } from "@/lib/workbench-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const config = await request.json() as ConnectionConfig;
    const discovery = await discoverAgent(config);
    const result: DiscoverResponse = {
      card: discovery.card,
      rawCard: discovery.rawCard,
      report: discovery.report,
      telemetry: discovery.telemetry,
      latencyMs: discovery.latencyMs,
    };
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
