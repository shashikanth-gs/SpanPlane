import { dataDirectory } from "@/server/runtime/runtime-config";
import type { EvidenceDirection, EvidenceRecord, EvidenceReferences, EvidenceSource } from "@/shared/evidence/types";
import { FileEvidenceRepository } from "./file-repository";

const repository = new FileEvidenceRepository(dataDirectory());
const SECRET_KEYS = /authorization|password|secret|token|api[-_]?key|cookie/i;

export function redactSecrets(value: unknown, seen = new WeakSet<object>()): unknown {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEYS.test(key) ? "[REDACTED]" : redactSecrets(item, seen)]));
}

export async function appendEvidence(input: {
  sessionId: string;
  requestId: string;
  source: EvidenceSource;
  direction: EvidenceDirection;
  kind: string;
  data: unknown;
  references?: EvidenceReferences;
  timestamp?: string;
}): Promise<EvidenceRecord> {
  const record: EvidenceRecord = {
    id: crypto.randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    sessionId: input.sessionId,
    requestId: input.requestId,
    source: input.source,
    direction: input.direction,
    kind: input.kind,
    data: redactSecrets(input.data),
    references: input.references,
  };
  await repository.append(record);
  return record;
}

export function listEvidence(sessionId: string, sources?: EvidenceSource[]) {
  return repository.list(sessionId, { sources });
}
