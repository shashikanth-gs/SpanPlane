import { afterEach, describe, expect, it } from "vitest";
import { assertSafeUrl, privateNetworksAllowed } from "./url-safety";

const originalDemoMode = process.env.A2A_DEPLOYMENT_MODE;
const originalPrivateNetworks = process.env.A2A_ALLOW_PRIVATE_NETWORKS;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalDemoMode === undefined) delete process.env.A2A_DEPLOYMENT_MODE;
  else process.env.A2A_DEPLOYMENT_MODE = originalDemoMode;
  if (originalPrivateNetworks === undefined) delete process.env.A2A_ALLOW_PRIVATE_NETWORKS;
  else process.env.A2A_ALLOW_PRIVATE_NETWORKS = originalPrivateNetworks;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

describe("public-demo URL policy", () => {
  it("requires HTTPS before doing a network lookup", async () => {
    process.env.A2A_DEPLOYMENT_MODE = "demo";
    await expect(assertSafeUrl("http://example.test/agent-card.json")).rejects.toThrow("only HTTPS");
  });

  it("still blocks loopback when a private-network override is present", async () => {
    process.env.A2A_DEPLOYMENT_MODE = "demo";
    process.env.A2A_ALLOW_PRIVATE_NETWORKS = "true";
    await expect(assertSafeUrl("https://127.0.0.1/agent-card.json")).rejects.toThrow("Private, loopback");
  });
});

describe("local network policy", () => {
  it("allows private test agents for a local npm installation even with NODE_ENV=production", async () => {
    delete process.env.A2A_DEPLOYMENT_MODE;
    process.env.NODE_ENV = "production";
    delete process.env.A2A_ALLOW_PRIVATE_NETWORKS;
    expect(privateNetworksAllowed()).toBe(true);
    await expect(assertSafeUrl("http://127.0.0.1:3000/.well-known/agent-card.json")).resolves.toBeInstanceOf(URL);
  });
});
