import { describe, expect, it } from "vitest";
import { buildSendRequest, selectAdvertisedInterface } from "./a2a-gateway";

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
