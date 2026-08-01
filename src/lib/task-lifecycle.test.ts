import { describe, expect, it } from "vitest";
import { conversationalTaskId, extractProtocolTimestamp, extractTaskCorrelation, extractTaskStatusUpdates, isTerminalTaskState } from "./task-lifecycle";

describe("A2A task lifecycle correlation", () => {
  it.each([3, 4, 5, 7, "3", "TASK_STATE_COMPLETED", "failed", "CANCELLED", "rejected"])(
    "recognizes terminal task state %s",
    (state) => expect(isTerminalTaskState(state)).toBe(true),
  );

  it.each([1, 2, 6, 8, "TASK_STATE_WORKING", "INPUT_REQUIRED", "AUTH_REQUIRED"])(
    "keeps resumable task state %s active",
    (state) => expect(isTerminalTaskState(state)).toBe(false),
  );

  it("extracts identifiers and terminal state from a streamed status update", () => {
    expect(extractTaskCorrelation({
      statusUpdate: {
        taskId: "task-1",
        contextId: "context-1",
        status: { state: "TASK_STATE_COMPLETED" },
      },
    })).toEqual({
      taskId: "task-1",
      contextId: "context-1",
      taskState: "TASK_STATE_COMPLETED",
    });
  });

  it("omits a completed task ID while preserving resumable task IDs", () => {
    expect(conversationalTaskId("task-1", "TASK_STATE_COMPLETED")).toBe("");
    expect(conversationalTaskId("task-1", "TASK_STATE_INPUT_REQUIRED")).toBe("task-1");
  });

  it("prefers the A2A task status timestamp over client receipt time", () => {
    expect(extractProtocolTimestamp({
      statusUpdate: { status: { state: "TASK_STATE_WORKING", timestamp: "2026-01-01T00:00:02Z" } },
    })).toBe("2026-01-01T00:00:02Z");
  });

  it("uses an extension artifact producer timestamp when present", () => {
    expect(extractProtocolTimestamp({ artifactUpdate: { artifact: { metadata: { timestamp: "2026-01-01T00:00:03Z" } } } })).toBe("2026-01-01T00:00:03Z");
  });

  it("extracts status evidence without promoting its message to a final response", () => {
    expect(extractTaskStatusUpdates({ statusUpdate: {
      taskId: "task-1",
      contextId: "context-1",
      status: { state: "TASK_STATE_WORKING", timestamp: "2026-01-01T00:00:02Z", message: { messageId: "progress", parts: [{ text: "Working" }] } },
    } })[0]).toMatchObject({ taskId: "task-1", contextId: "context-1", state: "TASK_STATE_WORKING", message: { messageId: "progress" } });
  });
});
