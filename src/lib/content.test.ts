import { describe, expect, it } from "vitest";
import { assembleArtifacts, assembleConversationTurns, assembleTasks, extractMessages, normalizePart, parseCsv } from "./content";

describe("content normalization", () => {
  it("normalizes v1 and v0.3 parts", () => {
    expect(normalizePart({ text: "hello", mediaType: "text/plain" })).toMatchObject({ kind: "text", value: "hello" });
    expect(normalizePart({ data: [{ city: "Kyoto" }], mediaType: "application/json" })).toMatchObject({ kind: "data", mediaType: "application/json" });
    expect(normalizePart({ raw: "iVBORw0KGgo=", filename: "map.png", mediaType: "image/png" })).toMatchObject({ kind: "raw", filename: "map.png", mediaType: "image/png" });
    expect(normalizePart({ url: "https://example.com/report.pdf", filename: "report.pdf", mediaType: "application/pdf" })).toMatchObject({ kind: "url", filename: "report.pdf", mediaType: "application/pdf" });
    expect(normalizePart({ kind: "file", file: { uri: "https://example.com/a.png", mimeType: "image/png" } })).toMatchObject({ kind: "url", mediaType: "image/png" });
    expect(normalizePart({ kind: "file", file: { bytes: "UklGRg==", name: "clip.wav", mimeType: "audio/wav" } })).toMatchObject({ kind: "raw", filename: "clip.wav", mediaType: "audio/wav" });
  });

  it("assembles append-only artifact stream chunks", () => {
    const artifacts = assembleArtifacts([
      { artifactUpdate: { artifact: { artifactId: "a", name: "Answer", parts: [{ text: "first" }] }, append: false, lastChunk: false } },
      { artifactUpdate: { artifact: { artifactId: "a", parts: [{ text: "second" }] }, append: true, lastChunk: true } },
    ]);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].parts.map((part) => part.value)).toEqual(["firstsecond"]);
    expect(artifacts[0].complete).toBe(true);
    expect(artifacts[0].updateCount).toBe(2);
  });

  it("repaints token chunks as one coherent text artifact while retaining chunk count", () => {
    const artifacts = assembleArtifacts([
      { artifactUpdate: { artifact: { artifactId: "answer", parts: [{ text: "Streaming " , mediaType: "text/markdown" }] }, append: false, lastChunk: false } },
      { artifactUpdate: { artifact: { artifactId: "answer", parts: [{ text: "token", mediaType: "text/markdown" }] }, append: true, lastChunk: false } },
      { artifactUpdate: { artifact: { artifactId: "answer", parts: [{ text: " output", mediaType: "text/markdown" }] }, append: true, lastChunk: true } },
    ]);

    expect(artifacts[0]).toMatchObject({ complete: true, updateCount: 3 });
    expect(artifacts[0].parts).toHaveLength(1);
    expect(artifacts[0].parts[0].value).toBe("Streaming token output");
  });

  it("preserves multiple independent artifacts produced by one task", () => {
    const artifacts = assembleArtifacts([
      { artifactUpdate: { taskId: "task-1", artifact: { artifactId: "markdown", name: "answer.md", parts: [{ text: "# Answer", mediaType: "text/markdown" }] }, lastChunk: true } },
      { artifactUpdate: { taskId: "task-1", artifact: { artifactId: "structured", name: "answer.json", parts: [{ data: { answer: 42 }, mediaType: "application/json" }] }, lastChunk: true } },
      { artifactUpdate: { taskId: "task-1", artifact: { artifactId: "image", name: "chart.png", parts: [{ raw: "iVBORw0KGgo=", mediaType: "image/png" }] }, lastChunk: true } },
    ]);
    expect(artifacts.map((artifact) => artifact.artifactId)).toEqual(["markdown", "structured", "image"]);
    expect(artifacts.every((artifact) => artifact.complete)).toBe(true);
  });

  it("can exclude extension artifacts already classified as sideband", () => {
    const events = [
      { artifactUpdate: { artifact: { artifactId: "trace-1", name: "trace.lifecycle", parts: [{ data: { state: "started" } }] }, lastChunk: true } },
      { artifactUpdate: { artifact: { artifactId: "response-1", name: "response", parts: [{ text: "Final answer" }] }, lastChunk: true } },
    ];
    expect(assembleArtifacts(events, { excludeArtifactIds: ["trace-1"] }).map((artifact) => artifact.artifactId)).toEqual(["response-1"]);
  });

  it("separates TaskStatus messages from direct agent messages when requested", () => {
    const event = { statusUpdate: { status: { state: "TASK_STATE_WORKING", message: { messageId: "progress", role: "ROLE_AGENT", parts: [{ text: "Working" }] } } } };
    expect(extractMessages(event)).toHaveLength(1);
    expect(extractMessages(event, { includeStatusMessages: false })).toEqual([]);
  });

  it("inherits a legacy artifact media type when its text part omits one", () => {
    const [artifact] = assembleArtifacts([{ artifacts: [{ artifactId: "md", mimeType: "text/markdown", parts: [{ kind: "text", text: "# Title" }] }] }]);
    expect(artifact.parts[0].mediaType).toBe("text/markdown");
  });

  it("reduces task, status, artifact, and message stream deltas", () => {
    const [task] = assembleTasks([
      { task: { id: "t1", contextId: "c1", status: { state: "TASK_STATE_SUBMITTED" }, artifacts: [], history: [] } },
      { statusUpdate: { taskId: "t1", contextId: "c1", status: { state: "TASK_STATE_WORKING", message: { messageId: "m1", taskId: "t1", parts: [{ text: "working" }] } } } },
      { artifactUpdate: { taskId: "t1", contextId: "c1", artifact: { artifactId: "a1", parts: [{ text: "done" }] }, append: false } },
      { statusUpdate: { taskId: "t1", contextId: "c1", status: { state: "TASK_STATE_COMPLETED" } } },
    ]);
    expect(task.status).toEqual({ state: "TASK_STATE_COMPLETED" });
    expect(task.artifacts).toHaveLength(1);
    expect(task.history).toHaveLength(1);
  });

  it("keeps artifacts from consecutive tasks in their originating conversation turns", () => {
    const firstMessage = { id: "m1", requestId: "r1", timestamp: "2026-01-01T00:00:00Z" };
    const secondMessage = { id: "m2", requestId: "r2", timestamp: "2026-01-01T00:01:00Z" };
    const turns = assembleConversationTurns([firstMessage, secondMessage], [
      { requestId: "r1", timestamp: "2026-01-01T00:00:01Z", value: { artifactUpdate: { taskId: "t1", artifact: { artifactId: "result", parts: [{ text: "first" }] }, lastChunk: true } } },
      { requestId: "r2", timestamp: "2026-01-01T00:01:01Z", value: { artifactUpdate: { taskId: "t2", artifact: { artifactId: "result", parts: [{ text: "second" }] }, lastChunk: true } } },
    ]);

    expect(turns.map((turn) => turn.requestId)).toEqual(["r1", "r2"]);
    expect(assembleArtifacts(turns[0].events.map((event) => event.value))[0].parts[0].value).toBe("first");
    expect(assembleArtifacts(turns[1].events.map((event) => event.value))[0].parts[0].value).toBe("second");
  });

  it("parses quoted CSV cells", () => {
    expect(parseCsv('name,note\nAda,"hello, world"')).toEqual([["name", "note"], ["Ada", "hello, world"]]);
  });
});
