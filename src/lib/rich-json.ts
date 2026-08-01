export type JsonRecord = Record<string, unknown>;

export function canUseRichJsonView(
  part: { kind: string; mediaType: string },
  enabled: boolean,
): boolean {
  return enabled && part.kind === "data" && part.mediaType.toLowerCase().includes("json");
}

export function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function humanizeJsonKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Value";
}

export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+-]+Z?)?$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

export function isScalarJson(value: unknown): boolean {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

export function tableColumns(rows: JsonRecord[], limit = 12): string[] {
  return [...new Set(rows.flatMap(Object.keys))].slice(0, limit);
}
