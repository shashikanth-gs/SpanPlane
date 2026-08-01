import { describe, expect, it } from "vitest";
import { buildExecutionTimeline } from "./execution-timeline";
import type { SidebandEvent, TelemetrySpan } from "@/shared/evidence/types";

const sideband = (id: string, timestamp: string): SidebandEvent => ({
  id, sessionId: "session", requestId: "request", timestamp,
  extensionUri: "urn:test", type: id, title: id, level: "info", parts: [],
});

const span = (id: string, startTime?: string, endTime?: string): TelemetrySpan => ({
  id, projectId: "project", projectName: "test", traceId: "trace", spanId: id,
  name: id, kind: "INTERNAL", statusCode: "OK", startTime, endTime,
  attributes: {}, events: [], raw: {},
});

describe("execution timeline", () => {
  const evidenceId = (item: ReturnType<typeof buildExecutionTimeline>[number]) => item.kind === "sideband" ? item.event.id : item.kind === "telemetry" ? item.span.id : item.status.id;

  it("orders evidence by producer time rather than collection order", () => {
    const timeline = buildExecutionTimeline(
      [sideband("tool-completed", "2026-01-01T00:00:03Z"), sideband("tool-started", "2026-01-01T00:00:01Z")],
      [span("late-polled-span", "2026-01-01T00:00:02Z", "2026-01-01T00:00:02.500Z")],
    );
    expect(timeline.map(evidenceId)).toEqual([
      "tool-started", "late-polled-span", "tool-completed",
    ]);
  });

  it("uses span start time for placement and leaves missing timestamps last", () => {
    const timeline = buildExecutionTimeline(
      [sideband("event", "2026-01-01T00:00:02Z")],
      [span("long-span", "2026-01-01T00:00:01Z", "2026-01-01T00:00:10Z"), span("unknown")],
    );
    expect(timeline.map(evidenceId)).toEqual([
      "long-span", "event", "unknown",
    ]);
  });

  it("interleaves A2A status updates with sideband and telemetry using producer time", () => {
    const timeline = buildExecutionTimeline(
      [sideband("tool", "2026-01-01T00:00:02Z")],
      [span("model", "2026-01-01T00:00:03Z")],
      [{ id: "working", timestamp: "2026-01-01T00:00:01Z", state: "TASK_STATE_WORKING" }],
    );
    expect(timeline.map(evidenceId)).toEqual(["working", "tool", "model"]);
  });
});
