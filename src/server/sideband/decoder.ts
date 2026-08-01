import { normalizePart, normalizeParts } from "../../lib/content";
import type { EvidenceReferences, SidebandEvent, SidebandLevel } from "../../shared/evidence/types";
import { decodeExtensionArtifact } from "./adapters";

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function stringValue(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function normalizeLevel(value: unknown): SidebandLevel {
  const level = String(value ?? "info").toLowerCase();
  if (["warn", "warning"].includes(level)) return "warning";
  if (level === "error") return "error";
  if (["debug", "trace"].includes(level)) return "debug";
  return "info";
}

function referencesFrom(value: JsonObject, fallback: EvidenceReferences): EvidenceReferences {
  return {
    contextId: stringValue(value.contextId, fallback.contextId),
    taskId: stringValue(value.taskId, value.id, fallback.taskId),
    messageId: stringValue(value.messageId, fallback.messageId),
    artifactId: stringValue(value.artifactId, fallback.artifactId),
    traceId: stringValue(value.traceId, fallback.traceId),
    spanId: stringValue(value.spanId, fallback.spanId),
  };
}

function envelopeReferences(value: unknown, current: EvidenceReferences = {}): EvidenceReferences {
  if (!isObject(value)) return current;
  const next = referencesFrom(value, current);
  for (const key of ["message", "task", "statusUpdate", "taskStatusUpdate", "artifactUpdate", "taskArtifactUpdate", "artifact"]) {
    if (isObject(value[key])) Object.assign(next, envelopeReferences(value[key], next));
  }
  return next;
}

function metadataContainers(value: unknown, containers: JsonObject[] = [], seen = new WeakSet<object>()): JsonObject[] {
  if (!value || typeof value !== "object" || seen.has(value)) return containers;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => metadataContainers(item, containers, seen));
    return containers;
  }
  const record = value as JsonObject;
  if (isObject(record.metadata)) containers.push(record.metadata);
  for (const [key, item] of Object.entries(record)) {
    if (key !== "metadata" && (Array.isArray(item) || isObject(item))) metadataContainers(item, containers, seen);
  }
  return containers;
}

function extensionArtifacts(value: unknown, artifacts: Array<{ artifact: JsonObject; references: EvidenceReferences }> = [], references: EvidenceReferences = {}, seen = new WeakSet<object>()) {
  if (!value || typeof value !== "object" || seen.has(value)) return artifacts;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => extensionArtifacts(item, artifacts, references, seen));
    return artifacts;
  }
  const record = value as JsonObject;
  const nextReferences = referencesFrom(record, references);
  if (typeof record.artifactId === "string" && Array.isArray(record.parts)) {
    artifacts.push({ artifact: record, references: { ...nextReferences, artifactId: record.artifactId } });
    return artifacts;
  }
  for (const item of Object.values(record)) {
    if (Array.isArray(item) || isObject(item)) extensionArtifacts(item, artifacts, nextReferences, seen);
  }
  return artifacts;
}

function payloadItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (isObject(payload) && Array.isArray(payload.events)) return payload.events;
  return [payload];
}

function eventParts(value: unknown) {
  if (typeof value === "string") return [normalizePart({ text: value, mediaType: "text/plain" })];
  if (!isObject(value)) return [normalizePart({ data: value, mediaType: "application/json" })];
  if (Array.isArray(value.parts)) return normalizeParts(value.parts);
  if (typeof value.markdown === "string") return [normalizePart({ text: value.markdown, mediaType: "text/markdown" })];
  const text = stringValue(value.text, value.message, value.content, value.description);
  if (text) return [normalizePart({ text, mediaType: stringValue(value.mediaType, value.mimeType) ?? "text/plain" })];
  if ("data" in value) return [normalizePart({ data: value.data, mediaType: stringValue(value.mediaType, value.mimeType) ?? "application/json" })];
  return [normalizePart({ data: value, mediaType: "application/json" })];
}

function toEvent(value: unknown, context: { sessionId: string; requestId: string; extensionUri: string; references: EvidenceReferences }): SidebandEvent {
  const record = isObject(value) ? value : {};
  const type = stringValue(record.type, record.kind, record.event, record.name) ?? "event";
  return {
    id: stringValue(record.id, record.eventId) ?? crypto.randomUUID(),
    sessionId: context.sessionId,
    requestId: context.requestId,
    timestamp: stringValue(record.timestamp, record.time) ?? new Date().toISOString(),
    extensionUri: context.extensionUri,
    type,
    title: stringValue(record.title, record.label, record.name) ?? type.replaceAll(/[._-]+/g, " "),
    level: normalizeLevel(record.level ?? record.severity),
    parts: eventParts(value),
    metadata: isObject(record.metadata) ? record.metadata : undefined,
    references: referencesFrom(record, context.references),
  };
}

/**
 * Extracts sideband payloads contributed through a negotiated A2A extension.
 * Ordinary metadata is intentionally ignored unless it lives under a negotiated
 * extension URI or the conventional `sideband`/`sidebandEvents` envelope.
 */
export function extractSidebandEvents(
  envelope: unknown,
  context: { sessionId: string; requestId: string; negotiatedExtensions: string[] },
): SidebandEvent[] {
  if (!context.negotiatedExtensions.length) return [];
  const references = envelopeReferences(envelope);
  const negotiated = new Set(context.negotiatedExtensions);
  const artifactEvents = extensionArtifacts(envelope).flatMap(({ artifact, references: artifactReferences }) => {
    const extensionUris = Array.isArray(artifact.extensions)
      ? artifact.extensions.filter((value): value is string => typeof value === "string" && negotiated.has(value))
      : [];
    return extensionUris.map((extensionUri) => decodeExtensionArtifact(artifact, {
      ...context,
      extensionUri,
      references: { ...references, ...artifactReferences },
    })).filter((event): event is SidebandEvent => Boolean(event));
  });
  const candidates: Array<{ extensionUri: string; payload: unknown }> = [];
  for (const metadata of metadataContainers(envelope)) {
    for (const extensionUri of context.negotiatedExtensions) {
      if (extensionUri in metadata) candidates.push({ extensionUri, payload: metadata[extensionUri] });
      for (const [key, payload] of Object.entries(metadata)) {
        if (key.startsWith(`${extensionUri}/`) && /\/(events|sideband)$/i.test(key)) candidates.push({ extensionUri, payload });
      }
      for (const key of ["sidebandEvents", "sideband"]) {
        if (key in metadata) candidates.push({ extensionUri, payload: metadata[key] });
      }
    }
  }
  const metadataEvents = candidates.flatMap(({ extensionUri, payload }) => payloadItems(payload).map((item) => ({ extensionUri, item })))
    .map(({ extensionUri, item }) => toEvent(item, { ...context, extensionUri, references }));
  const seen = new Set<string>();
  return [...artifactEvents, ...metadataEvents]
    .filter((event) => {
      const key = `${event.extensionUri}:${event.id}:${JSON.stringify(event.parts)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
