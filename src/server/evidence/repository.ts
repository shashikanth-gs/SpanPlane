import type { EvidenceRecord } from "@/shared/evidence/types";

export interface EvidenceQuery {
  sources?: EvidenceRecord["source"][];
}

export interface EvidenceRepository {
  append(record: EvidenceRecord): Promise<void>;
  list(sessionId: string, query?: EvidenceQuery): Promise<EvidenceRecord[]>;
}
