import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { RuntimePublicConfig } from "@/shared/evidence/types";
import { BUILT_IN_SIDEBAND_EXTENSION_URIS } from "../sideband/adapters";

function enabled(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

export function sidebandExtensionUris() {
  const configured = process.env.A2A_SIDEBAND_EXTENSION_URIS ?? process.env.A2A_SIDEBAND_EXTENSION_URI;
  const deploymentUris = configured?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  return [...new Set([...BUILT_IN_SIDEBAND_EXTENSION_URIS, ...deploymentUris])];
}

export function dataDirectory() {
  if (process.env.A2A_DATA_DIR) {
    return resolve(process.env.A2A_DATA_DIR);
  }
  
  if (process.env.VERCEL === "1" || process.env.AWS_REGION) {
    return join(tmpdir(), ".spanplane-data");
  }

  return join(/* turbopackIgnore: true */ process.cwd(), ".spanplane-data");
}

export function runtimePublicConfig(): RuntimePublicConfig {
  const provider = process.env.A2A_TELEMETRY_PROVIDER === "phoenix" ? "phoenix" : "none";
  const managed = process.env.A2A_PHOENIX_MANAGED === "true";
  const unavailable = process.env.A2A_TELEMETRY_STATUS === "unavailable";
  return {
    features: {
      rawEvidenceViews: enabled(process.env.A2A_ENABLE_RAW_VIEWS, true),
      richJsonViews: enabled(process.env.A2A_ENABLE_RICH_JSON, false),
    },
    sideband: {
      extensionUris: sidebandExtensionUris(),
    },
    telemetry: {
      provider,
      status: provider === "none" ? (unavailable ? "unavailable" : "disabled") : managed ? "managed" : "external",
      uiUrl: provider === "phoenix" ? process.env.A2A_PHOENIX_BASE_URL : undefined,
      otlpHttpEndpoint: provider === "phoenix" ? process.env.A2A_OTLP_HTTP_ENDPOINT : undefined,
      otlpGrpcEndpoint: provider === "phoenix" ? process.env.A2A_OTLP_GRPC_ENDPOINT : undefined,
    },
  };
}
