import { describe, expect, it } from "vitest";
import { extractSidebandEvents } from "./decoder";
import { A2A_WRAPPER_TRACE_EXTENSION_URI } from "./adapters";

const extensionUri = "urn:agent-observability:sideband-events:v1";

describe("extractSidebandEvents", () => {
  it("ignores unnegotiated metadata", () => {
    expect(extractSidebandEvents({ metadata: { sidebandEvents: [{ text: "hidden" }] } }, {
      sessionId: "session", requestId: "request", negotiatedExtensions: [],
    })).toEqual([]);
  });

  it("normalizes text events and preserves correlation", () => {
    const [event] = extractSidebandEvents({
      taskId: "task-1",
      contextId: "context-1",
      metadata: { [extensionUri]: { events: [{ type: "tool.started", text: "Calling inventory", traceId: "abc" }] } },
    }, { sessionId: "session", requestId: "request", negotiatedExtensions: [extensionUri] });
    expect(event).toMatchObject({
      sessionId: "session",
      requestId: "request",
      extensionUri,
      type: "tool.started",
      references: { taskId: "task-1", contextId: "context-1", traceId: "abc" },
      parts: [{ kind: "text", value: "Calling inventory", mediaType: "text/plain" }],
    });
  });

  it("supports markdown and structured sideband content", () => {
    const events = extractSidebandEvents({ metadata: { sidebandEvents: [
      { title: "Plan", markdown: "## Two steps" },
      { type: "budget", data: { remaining: 42 } },
    ] } }, { sessionId: "session", requestId: "request", negotiatedExtensions: [extensionUri] });
    expect(events[0].parts[0]).toMatchObject({ kind: "text", mediaType: "text/markdown" });
    expect(events[1].parts[0]).toMatchObject({ kind: "data", value: { remaining: 42 } });
  });

  it("accepts URI-scoped extension metadata keys", () => {
    const [event] = extractSidebandEvents({ metadata: { [`${extensionUri}/events`]: [{ text: "Scoped event" }] } }, {
      sessionId: "session", requestId: "request", negotiatedExtensions: [extensionUri],
    });
    expect(event.parts[0]).toMatchObject({ kind: "text", value: "Scoped event" });
  });

  it("decodes a2a-wrapper trace artifacts through its explicit compatibility adapter", () => {
    const [event] = extractSidebandEvents({ artifactUpdate: {
      taskId: "task-wrapper",
      contextId: "context-wrapper",
      artifact: {
        artifactId: "trace-mcp-1",
        name: "trace.mcp",
        extensions: [A2A_WRAPPER_TRACE_EXTENSION_URI],
        metadata: { traceType: "trace.mcp", timestamp: "2026-07-29T23:13:02.133Z" },
        parts: [{ data: { trace_id: "trace-wrapper", toolKind: "shell", status: "declined" }, metadata: { mimeType: "application/json" } }],
      },
    } }, { sessionId: "session", requestId: "request", negotiatedExtensions: [A2A_WRAPPER_TRACE_EXTENSION_URI] });

    expect(event).toMatchObject({
      id: "trace-mcp-1",
      extensionUri: A2A_WRAPPER_TRACE_EXTENSION_URI,
      type: "tool.declined",
      title: "Tool invocation declined",
      level: "warning",
      timestamp: "2026-07-29T23:13:02.133Z",
      metadata: { adapter: "a2a-wrapper", traceType: "trace.mcp" },
      references: { taskId: "task-wrapper", contextId: "context-wrapper", artifactId: "trace-mcp-1", traceId: "trace-wrapper" },
    });
    expect(event.parts[0]).toMatchObject({ kind: "data", value: { trace_id: "trace-wrapper", toolKind: "shell", status: "declined" } });
  });
});
