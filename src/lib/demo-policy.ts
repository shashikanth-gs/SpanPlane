import { DEMO_MAX_RAW_ATTACHMENT_BYTES, DEMO_MAX_TIMEOUT_MS, isDemoDeployment } from "./deployment";
import { RequestValidationError } from "./request-guard";
import { assertSafeUrl } from "./url-safety";
import type { ConnectionConfig, OperationAction } from "./workbench-types";

const PUSH_ACTIONS = new Set<OperationAction>([
  "createPushConfig", "getPushConfig", "listPushConfigs", "deletePushConfig",
]);

function byteLengthOfBase64(value: string): number {
  const normalized = value.replaceAll(/\s/g, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)) {
    throw new RequestValidationError("Raw attachment content must be valid base64.");
  }
  return Buffer.byteLength(normalized, "base64");
}

export async function enforceDemoConnectionPolicy(config: ConnectionConfig): Promise<void> {
  if (!isDemoDeployment()) return;
  if (config.auth?.type && config.auth.type !== "none") {
    throw new RequestValidationError("Authentication is disabled in the public demo. Run Workbench locally to test authenticated agents.");
  }
  if (Object.keys(config.headers ?? {}).length > 0) {
    throw new RequestValidationError("Custom headers are disabled in the public demo. Run Workbench locally to test them.");
  }
  if (config.diagnosticMode) throw new RequestValidationError("Diagnostic recovery is disabled in the public demo.");
  if (config.timeoutMs && config.timeoutMs > DEMO_MAX_TIMEOUT_MS) {
    throw new RequestValidationError(`The public demo limits each agent request to ${DEMO_MAX_TIMEOUT_MS / 1000} seconds.`);
  }
  await assertSafeUrl(config.cardUrl);
}

export async function enforceDemoOperationPolicy(input: {
  connection: ConnectionConfig;
  action: OperationAction;
  params?: Record<string, unknown>;
}): Promise<void> {
  if (!isDemoDeployment()) return;
  if (PUSH_ACTIONS.has(input.action)) {
    throw new RequestValidationError("Push webhook operations are disabled in the public demo. They can make third-party callback requests; test them locally.");
  }
  await enforceDemoConnectionPolicy(input.connection);

  let totalRawBytes = 0;
  const parts = Array.isArray(input.params?.parts) ? input.params.parts : [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const candidate = part as Record<string, unknown>;
    if (typeof candidate.raw === "string") totalRawBytes += byteLengthOfBase64(candidate.raw);
    if (typeof candidate.url === "string") await assertSafeUrl(candidate.url);
  }
  if (totalRawBytes > DEMO_MAX_RAW_ATTACHMENT_BYTES) {
    throw new RequestValidationError("The public demo accepts up to 1 MB of raw attachments per request. Run Workbench locally for larger files.");
  }
}
