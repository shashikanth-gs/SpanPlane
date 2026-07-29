/**
 * The public instance is intentionally a narrower execution environment than
 * a local Workbench. Keep this server-only switch separate from the public UI
 * flag: the server must remain safe even when a client is modified.
 */
export function isDemoDeployment(): boolean {
  return process.env.A2A_DEPLOYMENT_MODE === "demo";
}

export const DEMO_MAX_TIMEOUT_MS = 45_000;
export const DEMO_MAX_REQUEST_BYTES = 2 * 1024 * 1024;
export const DEMO_MAX_RAW_ATTACHMENT_BYTES = 1024 * 1024;
