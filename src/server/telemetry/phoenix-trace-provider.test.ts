import { afterEach, describe, expect, it, vi } from "vitest";
import { PhoenixTraceProvider } from "./phoenix-trace-provider";

afterEach(() => vi.unstubAllGlobals());

describe("PhoenixTraceProvider", () => {
  it("finds a trace across discovered projects without assuming a project name", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("/v1/projects?")) return new Response(JSON.stringify({ data: [
        { id: "project-a", name: "framework-a" },
        { id: "project-b", name: "framework-b" },
      ] }), { status: 200 });
      const spans = url.includes("project-b") ? [{
        id: "span-global", name: "inventory.lookup", span_kind: "TOOL", status_code: "OK",
        context: { trace_id: "a".repeat(32), span_id: "b".repeat(16) }, attributes: { "tool.name": "inventory.lookup" }, events: [],
      }] : [];
      return new Response(JSON.stringify({ data: spans }), { status: 200 });
    }));

    const result = await new PhoenixTraceProvider("http://127.0.0.1:6006/").findTrace("a".repeat(32));
    expect(result.projectsScanned).toBe(2);
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0]).toMatchObject({ projectName: "framework-b", kind: "TOOL", name: "inventory.lookup" });
    expect(requested.some((url) => url.includes("project-a"))).toBe(true);
    expect(requested.some((url) => url.includes("project-b"))).toBe(true);
  });
});
