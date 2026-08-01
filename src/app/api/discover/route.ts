import { NextResponse } from "next/server";
import { discoverAgent } from "@/lib/spanplane-gateway";
import { apiError } from "@/lib/api-response";
import { readJsonRequest } from "@/lib/request-guard";
import type { ConnectionConfig, DiscoverResponse } from "@/lib/workbench-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const config = await readJsonRequest<ConnectionConfig>(request);
    const discovery = await discoverAgent(config);
    const result: DiscoverResponse = {
      resolvedCardUrl: discovery.resolvedCardUrl,
      card: discovery.card,
      rawCard: discovery.rawCard,
      report: discovery.report,
      telemetry: discovery.telemetry,
      latencyMs: discovery.latencyMs,
      sideband: discovery.sideband,
    };
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
