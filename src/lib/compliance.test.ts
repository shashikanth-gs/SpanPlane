import { describe, expect, it } from "vitest";
import { detectCardVersion, validateA2APayload, validateAgentCard } from "./compliance";

const v1Card = {
  name: "Test Agent",
  description: "A test fixture",
  version: "1.2.3",
  supportedInterfaces: [{ url: "https://agent.example/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0", tenant: "" }],
  capabilities: { streaming: true },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["application/json"],
  skills: [{ id: "test", name: "Test", description: "Runs a test", tags: ["testing"] }],
  securitySchemes: {},
  securityRequirements: [],
  signatures: [],
};

describe("Agent Card compliance", () => {
  it("recognizes and accepts a complete v1 card", () => {
    const report = validateAgentCard(v1Card);
    expect(detectCardVersion(v1Card)).toBe("1.0");
    expect(report.counts.error).toBe(0);
    expect(report.score).toBe(100);
  });

  it("recognizes v0.3 and reports missing required fields", () => {
    const report = validateAgentCard({ ...v1Card, supportedInterfaces: undefined, protocolVersion: "0.3", url: "http://localhost:3000/a2a", skills: [] });
    expect(report.version).toBe("0.3");
    expect(report.issues.some((issue) => issue.id === "card.skills")).toBe(true);
    expect(report.issues.some((issue) => issue.id === "v03.transport")).toBe(true);
  });

  it("reports non-standard v0.3 REST transport labels", () => {
    const report = validateAgentCard({
      ...v1Card,
      supportedInterfaces: undefined,
      protocolVersion: "0.3.0",
      url: "http://localhost:3000/a2a/jsonrpc",
      preferredTransport: "JSONRPC",
      additionalInterfaces: [{ url: "http://localhost:3000/a2a/rest", transport: "REST" }],
    });
    expect(report.issues).toContainEqual(expect.objectContaining({ id: "v03.interface.transport.custom", severity: "warning" }));
  });

  it("enforces the v1 Part oneof", () => {
    const issues = validateA2APayload({ parts: [{ text: "hello", data: { duplicate: true } }] });
    expect(issues).toContainEqual(expect.objectContaining({ id: "part.oneof", severity: "error" }));
  });

  it("accepts the official gRPC host:port interface form", () => {
    const report = validateAgentCard({
      ...v1Card,
      supportedInterfaces: [...v1Card.supportedInterfaces, { url: "localhost:41242", protocolBinding: "GRPC", protocolVersion: "1.0", tenant: "" }],
    });
    expect(report.issues.find((issue) => issue.path === "$.supportedInterfaces[1].url")).toBeUndefined();
  });

  it("does not treat versioned compatibility interfaces as duplicates", () => {
    const report = validateAgentCard({
      ...v1Card,
      supportedInterfaces: [
        ...v1Card.supportedInterfaces,
        { ...v1Card.supportedInterfaces[0], protocolVersion: "0.3" },
      ],
    });
    expect(report.issues.find((issue) => issue.id === "v1.interface.duplicate")).toBeUndefined();
  });
});
