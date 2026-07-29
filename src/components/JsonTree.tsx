"use client";

export function JsonTree({ value, name, depth = 0 }: { value: unknown; name?: string; depth?: number }) {
  if (value === null || typeof value !== "object") {
    return <div className="json-leaf"><span>{name ? `${name}: ` : ""}</span><code>{typeof value === "string" ? `"${value}"` : String(value)}</code></div>;
  }
  const entries = Object.entries(value);
  return (
    <details className="json-node" open={depth < 2}>
      <summary>{name ? `${name} ` : ""}<span>{Array.isArray(value) ? `Array(${entries.length})` : `{${entries.length}}`}</span></summary>
      <div className="json-children">
        {entries.map(([key, item]) => <JsonTree key={key} name={key} value={item} depth={depth + 1} />)}
      </div>
    </details>
  );
}
