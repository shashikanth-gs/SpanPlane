import { describe, expect, it } from "vitest";
import { redactHeaders, redactValue } from "./redact";

describe("telemetry redaction", () => {
  it("redacts sensitive headers and nested values", () => {
    expect(redactHeaders({ Authorization: "Bearer private", Accept: "application/json" })).toEqual({ Authorization: "••••••••", Accept: "application/json" });
    expect(redactValue({ nested: { apiKey: "private", visible: true } })).toEqual({ nested: { apiKey: "••••••••", visible: true } });
  });
});
