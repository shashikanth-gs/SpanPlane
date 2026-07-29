import { describe, expect, it } from "vitest";
import { extractSidebandEvents } from "./decoder";

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
});
