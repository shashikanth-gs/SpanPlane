import { describe, expect, it } from "vitest";
import { agentCardUrlCandidates, buildSendRequest, dedupeSupportedInterfaces, selectAdvertisedInterface } from "./spanplane-gateway";

describe("Agent Card URL discovery", () => {
  it("turns an agent base URL into the standard well-known card URL", () => {
    expect(agentCardUrlCandidates("http://127.0.0.1:4201")[0]).toBe(
      "http://127.0.0.1:4201/.well-known/agent-card.json",
    );
  });

  it("preserves an explicit Agent Card URL", () => {
    expect(agentCardUrlCandidates("https://agent.example/custom/card.json")).toEqual([
      "https://agent.example/custom/card.json",
    ]);
  });

  it("tries SDK-relative and origin-root discovery for a nested endpoint", () => {
    expect(agentCardUrlCandidates("https://agent.example/a2a/")).toEqual([
      "https://agent.example/a2a/.well-known/agent-card.json",
      "https://agent.example/.well-known/agent-card.json",
      "https://agent.example/a2a/",
    ]);
  });
});

describe("advertised interface selection", () => {
  it("distinguishes protocol versions that share a binding and URL", () => {
    const interfaces = ["1.0", "0.3"].map((protocolVersion) => ({
      url: "https://agent.example/a2a",
      protocolBinding: "JSONRPC",
      protocolVersion,
      tenant: "",
    }));

    expect(selectAdvertisedInterface(interfaces, {
      interfaceUrl: "https://agent.example/a2a",
      protocolBinding: "JSONRPC",
      protocolVersion: "0.3",
    })?.protocolVersion).toBe("0.3");
  });

  it("deduplicates equivalent v0.3 main and additional interfaces", () => {
    const interfaces = dedupeSupportedInterfaces([
      { url: "https://agent.example/a2a", protocolBinding: "JSONRPC", protocolVersion: "0.3.0", tenant: "" },
      { url: "https://agent.example/a2a", protocolBinding: "JSONRPC", protocolVersion: "0.3", tenant: "" },
      { url: "https://agent.example/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0", tenant: "" },
    ]);
    expect(interfaces.map((item) => item.protocolVersion)).toEqual(["0.3.0", "1.0"]);
  });
});

describe("A2A message part construction", () => {
  it("builds text, structured data, raw file, and URL parts through the official SDK", () => {
    const request = buildSendRequest({
      parts: [
        { text: "# Markdown", mediaType: "text/markdown", filename: "brief.md" },
        { data: { tripId: "T-42", travelers: 2 }, mediaType: "application/json" },
        { raw: "UEsDBAoAAAAA", mediaType: "application/zip", filename: "bundle.zip" },
        { url: "https://example.com/reference.png", mediaType: "image/png", filename: "reference.png" },
      ],
    });

    expect(request.message?.parts.map((part) => part.content?.$case)).toEqual(["text", "data", "raw", "url"]);
    expect(request.message?.parts[1].content).toMatchObject({ $case: "data", value: { tripId: "T-42", travelers: 2 } });
    expect(request.message?.parts[2]).toMatchObject({ mediaType: "application/zip", filename: "bundle.zip" });
    expect(request.message?.parts[3]).toMatchObject({ mediaType: "image/png", filename: "reference.png" });
  });

  it("advertises every content family rendered by the Workbench", () => {
    const modes = buildSendRequest({ text: "hello" }).configuration?.acceptedOutputModes ?? [];
    expect(modes).toEqual(expect.arrayContaining([
      "text/plain", "text/markdown", "text/csv", "application/json", "application/pdf",
      "application/octet-stream", "application/zip", "image/*", "audio/*", "video/*",
    ]));
  });
});
