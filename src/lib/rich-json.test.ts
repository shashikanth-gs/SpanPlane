import { describe, expect, it } from "vitest";
import { canUseRichJsonView, humanizeJsonKey, isIsoDateTime, safeHttpUrl, tableColumns } from "./rich-json";

describe("rich JSON helpers", () => {
  it("humanizes common agent field names", () => {
    expect(humanizeJsonKey("estimated_local_total")).toBe("Estimated local total");
    expect(humanizeJsonKey("contextId")).toBe("Context Id");
  });

  it("allows only HTTP links", () => {
    expect(safeHttpUrl("https://example.com/result.json")).toBe("https://example.com/result.json");
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("data:text/html,unsafe")).toBeUndefined();
  });

  it("recognizes ISO dates without treating arbitrary text as a date", () => {
    expect(isIsoDateTime("2026-07-30T12:30:00Z")).toBe(true);
    expect(isIsoDateTime("three days in Kyoto")).toBe(false);
  });

  it("caps inferred table columns", () => {
    expect(tableColumns([{ a: 1, b: 2 }, { c: 3 }], 2)).toEqual(["a", "b"]);
  });

  it("offers the experimental view only for structured JSON data parts", () => {
    expect(canUseRichJsonView({ kind: "data", mediaType: "application/json" }, true)).toBe(true);
    expect(canUseRichJsonView({ kind: "data", mediaType: "application/vnd.example+json" }, true)).toBe(true);
    expect(canUseRichJsonView({ kind: "raw", mediaType: "application/json" }, true)).toBe(false);
    expect(canUseRichJsonView({ kind: "url", mediaType: "application/json" }, true)).toBe(false);
    expect(canUseRichJsonView({ kind: "data", mediaType: "application/json" }, false)).toBe(false);
  });
});
