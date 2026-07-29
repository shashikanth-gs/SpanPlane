import { strToU8, zipSync } from "fflate";
import { listEvidence } from "@/server/evidence/service";
import type { EvidenceRecord, EvidenceSource } from "@/shared/evidence/types";

const EXPORTABLE_SOURCES: EvidenceSource[] = ["a2a", "sideband", "otel", "runtime"];

function jsonLines(records: EvidenceRecord[]) {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

export function parseExportSources(value: string | null): EvidenceSource[] {
  if (!value) return EXPORTABLE_SOURCES;
  const requested = new Set(value.split(",").map((item) => item.trim()));
  return EXPORTABLE_SOURCES.filter((source) => requested.has(source));
}

export async function createSessionExport(sessionId: string, sources: EvidenceSource[]) {
  const records = await listEvidence(sessionId, sources);
  const counts = Object.fromEntries(EXPORTABLE_SOURCES.map((source) => [source, records.filter((record) => record.source === source).length]));
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify({
      schemaVersion: 1,
      sessionId,
      generatedAt: new Date().toISOString(),
      sources,
      counts,
      note: "A2A evidence retains messages, task updates, and artifact payloads exactly as captured after secret-field redaction.",
    }, null, 2)),
    "timeline/events.jsonl": strToU8(jsonLines(records)),
  };
  for (const source of sources) {
    files[`${source}/events.jsonl`] = strToU8(jsonLines(records.filter((record) => record.source === source)));
  }
  return { archive: zipSync(files, { level: 6 }), count: records.length };
}
