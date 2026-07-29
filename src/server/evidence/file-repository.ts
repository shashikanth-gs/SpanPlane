import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvidenceRecord } from "@/shared/evidence/types";
import type { EvidenceQuery, EvidenceRepository } from "./repository";

const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;

function assertSafeId(sessionId: string) {
  if (!SAFE_ID.test(sessionId)) throw new Error("Invalid session identifier.");
}

export class FileEvidenceRepository implements EvidenceRepository {
  private readonly pending = new Map<string, Promise<void>>();

  constructor(private readonly rootDirectory: string) {}

  private file(sessionId: string) {
    assertSafeId(sessionId);
    return join(this.rootDirectory, "sessions", `${sessionId}.jsonl`);
  }

  append(record: EvidenceRecord): Promise<void> {
    const file = this.file(record.sessionId);
    const previous = this.pending.get(record.sessionId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        await mkdir(join(this.rootDirectory, "sessions"), { recursive: true, mode: 0o700 });
        await appendFile(file, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
      });
    this.pending.set(record.sessionId, next);
    const cleanup = () => {
      if (this.pending.get(record.sessionId) === next) this.pending.delete(record.sessionId);
    };
    void next.then(cleanup, cleanup);
    return next;
  }

  async list(sessionId: string, query: EvidenceQuery = {}): Promise<EvidenceRecord[]> {
    await this.pending.get(sessionId)?.catch(() => undefined);
    let content: string;
    try { content = await readFile(this.file(sessionId), "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const sources = query.sources?.length ? new Set(query.sources) : undefined;
    return content.split("\n").filter(Boolean).map((line) => JSON.parse(line) as EvidenceRecord)
      .filter((record) => !sources || sources.has(record.source));
  }
}
