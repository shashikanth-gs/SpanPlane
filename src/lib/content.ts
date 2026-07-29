import type { AssembledArtifact, NormalizedPart } from "./workbench-types";

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function mediaType(part: JsonObject, fallback = "application/octet-stream") {
  return String(part.mediaType ?? part.mimeType ?? (isObject(part.file) ? part.file.mimeType ?? "" : "") ?? fallback).toLowerCase() || fallback;
}

export function normalizePart(part: unknown, index = 0): NormalizedPart {
  if (!isObject(part)) return { id: `part-${index}`, kind: "unknown", value: part, mediaType: "application/octet-stream" };
  const common = {
    id: String(part.id ?? `part-${index}`),
    mediaType: mediaType(part),
    filename: String(part.filename ?? (isObject(part.file) ? part.file.name ?? "" : "")) || undefined,
    metadata: isObject(part.metadata) ? part.metadata : undefined,
  };
  if (typeof part.text === "string" || part.kind === "text") return { ...common, kind: "text", value: String(part.text ?? ""), mediaType: mediaType(part, "text/plain") };
  if ("data" in part || part.kind === "data") return { ...common, kind: "data", value: part.data, mediaType: mediaType(part, "application/json") };
  if (typeof part.url === "string") return { ...common, kind: "url", value: part.url };
  if (typeof part.raw === "string") return { ...common, kind: "raw", value: part.raw };
  if (part.kind === "file" && isObject(part.file)) {
    if (typeof part.file.uri === "string") return { ...common, kind: "url", value: part.file.uri };
    if (typeof part.file.bytes === "string") return { ...common, kind: "raw", value: part.file.bytes };
  }
  return { ...common, kind: "unknown", value: part };
}

export function normalizeParts(value: unknown): NormalizedPart[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizePart);
}

export function extractMessages(value: unknown): JsonObject[] {
  if (!isObject(value)) return [];
  if (Array.isArray(value.parts) && ("role" in value || "messageId" in value)) return [value];
  const messages: JsonObject[] = [];
  for (const key of ["message", "task", "statusUpdate"]) {
    const child = value[key];
    if (isObject(child)) messages.push(...extractMessages(child));
  }
  if (Array.isArray(value.history)) value.history.forEach((item) => messages.push(...extractMessages(item)));
  if (isObject(value.status) && isObject(value.status.message)) messages.push(...extractMessages(value.status.message));
  return messages;
}

function artifactFrom(value: unknown): JsonObject | undefined {
  if (!isObject(value)) return undefined;
  if (typeof value.artifactId === "string" && Array.isArray(value.parts)) return value;
  if (isObject(value.artifact)) return value.artifact;
  return undefined;
}

export function assembleArtifacts(events: unknown[]): AssembledArtifact[] {
  const map = new Map<string, AssembledArtifact>();
  const visit = (value: unknown) => {
    if (!isObject(value)) return;
    if (Array.isArray(value.artifacts)) value.artifacts.forEach((item) => merge(item, false, true));
    if (isObject(value.task)) visit(value.task);
    if (isObject(value.artifactUpdate)) {
      const update = value.artifactUpdate;
      merge(update.artifact, Boolean(update.append), Boolean(update.lastChunk));
    }
    if (isObject(value.taskArtifactUpdate)) {
      const update = value.taskArtifactUpdate;
      merge(update.artifact, Boolean(update.append), Boolean(update.lastChunk));
    }
  };
  const merge = (raw: unknown, append: boolean, complete: boolean) => {
    const artifact = artifactFrom(raw);
    if (!artifact) return;
    const id = String(artifact.artifactId);
    const inheritedMediaType = typeof artifact.mimeType === "string" ? artifact.mimeType : undefined;
    const rawParts = Array.isArray(artifact.parts) ? artifact.parts : [];
    const next = rawParts.map((rawPart, index) => {
      const part = normalizePart(rawPart, index);
      const hasOwnMediaType = isObject(rawPart) && (
        typeof rawPart.mediaType === "string" ||
        typeof rawPart.mimeType === "string" ||
        (isObject(rawPart.file) && typeof rawPart.file.mimeType === "string")
      );
      return inheritedMediaType && !hasOwnMediaType ? { ...part, mediaType: inheritedMediaType } : part;
    });
    const current = map.get(id);
    map.set(id, {
      artifactId: id,
      name: typeof artifact.name === "string" ? artifact.name : current?.name,
      description: typeof artifact.description === "string" ? artifact.description : current?.description,
      parts: append && current ? [...current.parts, ...next] : next,
      complete: complete || current?.complete || false,
    });
  };
  events.forEach(visit);
  return [...map.values()];
}

export function extractTask(value: unknown): JsonObject | undefined {
  if (!isObject(value)) return undefined;
  if (typeof value.id === "string" && isObject(value.status)) return value;
  if (isObject(value.task)) return extractTask(value.task);
  return undefined;
}

export function assembleTasks(events: unknown[]): JsonObject[] {
  const tasks = new Map<string, JsonObject>();
  const upsertTask = (task: JsonObject) => {
    const id = String(task.id ?? "");
    if (!id) return;
    const current = tasks.get(id) ?? { id, contextId: task.contextId ?? "", artifacts: [], history: [] };
    tasks.set(id, {
      ...current,
      ...task,
      artifacts: Array.isArray(task.artifacts) ? task.artifacts : current.artifacts,
      history: Array.isArray(task.history) ? task.history : current.history,
    });
  };
  const updateStatus = (update: JsonObject) => {
    const id = String(update.taskId ?? "");
    if (!id) return;
    const current = tasks.get(id) ?? { id, contextId: update.contextId ?? "", artifacts: [], history: [] };
    const status = isObject(update.status) ? update.status : current.status;
    const message = isObject(status) && isObject(status.message) ? status.message : undefined;
    const history = Array.isArray(current.history) ? [...current.history] : [];
    if (message && !history.some((item) => isObject(item) && item.messageId === message.messageId)) history.push(message);
    tasks.set(id, { ...current, contextId: update.contextId ?? current.contextId, status, history });
  };
  const updateArtifact = (update: JsonObject) => {
    const id = String(update.taskId ?? "");
    if (!id || !isObject(update.artifact)) return;
    const current = tasks.get(id) ?? { id, contextId: update.contextId ?? "", status: { state: "TASK_STATE_UNSPECIFIED" }, artifacts: [], history: [] };
    const artifacts = Array.isArray(current.artifacts) ? [...current.artifacts] : [];
    const artifact = update.artifact;
    const artifactId = String(artifact.artifactId ?? "");
    const index = artifacts.findIndex((item) => isObject(item) && item.artifactId === artifactId);
    if (index >= 0 && update.append) {
      const previous = artifacts[index] as JsonObject;
      artifacts[index] = { ...previous, ...artifact, parts: [...(Array.isArray(previous.parts) ? previous.parts : []), ...(Array.isArray(artifact.parts) ? artifact.parts : [])] };
    } else if (index >= 0) artifacts[index] = artifact;
    else artifacts.push(artifact);
    tasks.set(id, { ...current, contextId: update.contextId ?? current.contextId, artifacts });
  };
  const updateMessage = (message: JsonObject) => {
    const id = String(message.taskId ?? "");
    if (!id || !tasks.has(id)) return;
    const current = tasks.get(id)!;
    const history = Array.isArray(current.history) ? [...current.history] : [];
    if (!history.some((item) => isObject(item) && item.messageId === message.messageId)) history.push(message);
    tasks.set(id, { ...current, history });
  };
  const visit = (value: unknown) => {
    if (!isObject(value)) return;
    if (typeof value.id === "string" && isObject(value.status)) upsertTask(value);
    if (isObject(value.task)) upsertTask(value.task);
    if (isObject(value.statusUpdate)) updateStatus(value.statusUpdate);
    if (isObject(value.taskStatusUpdate)) updateStatus(value.taskStatusUpdate);
    if (isObject(value.artifactUpdate)) updateArtifact(value.artifactUpdate);
    if (isObject(value.taskArtifactUpdate)) updateArtifact(value.taskArtifactUpdate);
    if (isObject(value.message)) updateMessage(value.message);
  };
  events.forEach(visit);
  return [...tasks.values()];
}

export function safeContentUrl(part: NormalizedPart): string | undefined {
  if (part.kind === "raw" && typeof part.value === "string") return `data:${part.mediaType};base64,${part.value}`;
  if (part.kind !== "url" || typeof part.value !== "string") return undefined;
  try {
    const url = new URL(part.value, window.location.origin);
    if (["http:", "https:", "data:", "blob:"].includes(url.protocol)) return url.toString();
  } catch { return undefined; }
  return undefined;
}

export function isTabular(value: unknown): value is JsonObject[] {
  return Array.isArray(value) && value.length > 0 && value.every(isObject);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
