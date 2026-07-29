import { afterEach, describe, expect, it } from "vitest";
import { enforceDemoConnectionPolicy, enforceDemoOperationPolicy } from "./demo-policy";

const originalDemoMode = process.env.A2A_DEPLOYMENT_MODE;

afterEach(() => {
  if (originalDemoMode === undefined) delete process.env.A2A_DEPLOYMENT_MODE;
  else process.env.A2A_DEPLOYMENT_MODE = originalDemoMode;
});

describe("public-demo operation policy", () => {
  it("rejects credentials without trying to contact the supplied target", async () => {
    process.env.A2A_DEPLOYMENT_MODE = "demo";
    await expect(enforceDemoConnectionPolicy({
      cardUrl: "https://example.invalid/agent-card.json",
      auth: { type: "bearer", token: "secret" },
      headers: {},
    })).rejects.toThrow("Authentication is disabled");
  });

  it("rejects agent-triggered push webhooks", async () => {
    process.env.A2A_DEPLOYMENT_MODE = "demo";
    await expect(enforceDemoOperationPolicy({
      connection: { cardUrl: "https://example.invalid/agent-card.json", auth: { type: "none" }, headers: {} },
      action: "createPushConfig",
    })).rejects.toThrow("Push webhook operations are disabled");
  });
});
