import { describe, expect, it } from "vitest";
import { buildComposerParts, createComposerPart, mediaTypeIsAdvertised } from "./message-parts";

describe("conversation composer parts", () => {
  it("sends plain text and Markdown as text parts with an explicit media type", () => {
    expect(createComposerPart("hello", "plain")).toEqual({ text: "hello", mediaType: "text/plain" });
    expect(createComposerPart("# Trip", "markdown")).toEqual({ text: "# Trip", mediaType: "text/markdown" });
  });

  it("parses JSON into a true structured data part", () => {
    expect(createComposerPart('{"destination":"Kyoto","travelers":2}', "json")).toEqual({
      data: { destination: "Kyoto", travelers: 2 },
      mediaType: "application/json",
    });
  });

  it("rejects invalid JSON before it reaches an agent", () => {
    expect(() => createComposerPart('{"destination":}', "json")).toThrow("JSON message is invalid");
  });

  it("keeps attached files as named raw byte parts after the editor part", () => {
    expect(buildComposerParts("# Brief", "markdown", [{
      name: "bundle.zip",
      mediaType: "application/zip",
      raw: "UEsDBA==",
    }])).toEqual([
      { text: "# Brief", mediaType: "text/markdown" },
      { raw: "UEsDBA==", mediaType: "application/zip", filename: "bundle.zip" },
    ]);
  });

  it("matches exact and wildcard Agent Card input modes", () => {
    expect(mediaTypeIsAdvertised("application/json", ["text/plain", "application/json"])).toBe(true);
    expect(mediaTypeIsAdvertised("image/png", ["image/*"])).toBe(true);
    expect(mediaTypeIsAdvertised("text/markdown", ["text/plain", "application/json"])).toBe(false);
  });
});
