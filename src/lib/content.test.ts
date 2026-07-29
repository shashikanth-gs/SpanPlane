import { describe, expect, it } from "vitest";
import { assembleArtifacts, assembleTasks, normalizePart, parseCsv } from "./content";

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
    expect(artifacts[0].parts.map((part) => part.value)).toEqual(["first", "second"]);
    expect(artifacts[0].complete).toBe(true);
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

  it("parses quoted CSV cells", () => {
    expect(parseCsv('name,note\nAda,"hello, world"')).toEqual([["name", "note"], ["Ada", "hello, world"]]);
  });
});
