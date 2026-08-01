"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import {
  humanizeJsonKey,
  isIsoDateTime,
  isJsonRecord,
  isScalarJson,
  safeHttpUrl,
  tableColumns,
  type JsonRecord,
} from "@/lib/rich-json";

const MAX_DEPTH = 4;
const MAX_ITEMS = 50;
const MAX_COLUMNS = 12;

function ScalarValue({ value }: { value: unknown }) {
  if (value === null) return <span className="rich-json-null">null</span>;
  if (typeof value === "boolean") return <span className={`rich-json-boolean ${value ? "true" : "false"}`}>{String(value)}</span>;
  if (typeof value === "number") return <strong className="rich-json-number">{Number.isFinite(value) ? value.toLocaleString() : String(value)}</strong>;
  const text = String(value);
  const url = safeHttpUrl(text);
  if (url) return <a className="rich-json-link" href={url} target="_blank" rel="noreferrer">{text}<ExternalLink size={12} /></a>;
  if (isIsoDateTime(text)) return <time className="rich-json-date" dateTime={text} title={text}>{new Date(text).toLocaleString()}</time>;
  return <span className="rich-json-text">{text}</span>;
}

function RecordTable({ rows }: { rows: JsonRecord[] }) {
  const columns = tableColumns(rows, MAX_COLUMNS);
  const totalColumns = new Set(rows.flatMap(Object.keys)).size;
  const visibleRows = rows.slice(0, MAX_ITEMS);
  return <div className="rich-json-table-wrap">
    <table className="rich-json-table">
      <thead><tr>{columns.map((column) => <th key={column}>{humanizeJsonKey(column)}</th>)}</tr></thead>
      <tbody>{visibleRows.map((row, rowIndex) => <tr key={rowIndex}>{columns.map((column) => <td key={column}>{isScalarJson(row[column]) ? <ScalarValue value={row[column]} /> : <code>{JSON.stringify(row[column])}</code>}</td>)}</tr>)}</tbody>
    </table>
    {(rows.length > visibleRows.length || totalColumns > columns.length) && <p className="rich-json-limit">Showing {visibleRows.length} of {rows.length} rows and {columns.length} of {totalColumns} columns.</p>}
  </div>;
}

function ArrayValue({ value, depth }: { value: unknown[]; depth: number }) {
  const visible = value.slice(0, MAX_ITEMS);
  if (value.length > 0 && value.every(isJsonRecord)) return <RecordTable rows={value} />;
  if (value.every(isScalarJson)) return <div className="rich-json-chip-list">{visible.map((item, index) => <span className="rich-json-chip" key={index}><ScalarValue value={item} /></span>)}{value.length > visible.length && <span className="rich-json-more">+{value.length - visible.length} more</span>}</div>;
  return <div className="rich-json-array">{visible.map((item, index) => <section key={index}><header>Item {index + 1}</header><RichValue value={item} depth={depth + 1} /></section>)}{value.length > visible.length && <p className="rich-json-limit">Showing {visible.length} of {value.length} items.</p>}</div>;
}

function ObjectValue({ value, depth }: { value: JsonRecord; depth: number }) {
  const entries = Object.entries(value);
  const visibleEntries = entries.slice(0, MAX_ITEMS);
  const scalarEntries = visibleEntries.filter(([, item]) => isScalarJson(item));
  const nestedEntries = visibleEntries.filter(([, item]) => !isScalarJson(item));
  return <div className="rich-json-object">
    {scalarEntries.length > 0 && <dl className="rich-json-summary">{scalarEntries.map(([key, item]) => <div key={key}><dt>{humanizeJsonKey(key)}</dt><dd><ScalarValue value={item} /></dd></div>)}</dl>}
    {nestedEntries.map(([key, item]) => <section className="rich-json-section" key={key}><header><strong>{humanizeJsonKey(key)}</strong><span>{Array.isArray(item) ? `${item.length} item${item.length === 1 ? "" : "s"}` : "object"}</span></header><RichValue value={item} depth={depth + 1} /></section>)}
    {entries.length > MAX_ITEMS && <p className="rich-json-limit">Showing the first {MAX_ITEMS} fields.</p>}
  </div>;
}

function RichValue({ value, depth }: { value: unknown; depth: number }) {
  if (depth >= MAX_DEPTH && !isScalarJson(value)) return <pre className="rich-json-depth-limit">{JSON.stringify(value, null, 2)}</pre>;
  if (Array.isArray(value)) return <ArrayValue value={value} depth={depth} />;
  if (isJsonRecord(value)) return <ObjectValue value={value} depth={depth} />;
  return <ScalarValue value={value} />;
}

export function RichJsonView({ value }: { value: unknown }) {
  return <div className="rich-json-view">
    <header><div><Sparkles size={14} /><strong>Rich JSON</strong><span>Experimental</span></div><small>Deterministic, inferred presentation</small></header>
    <div className="rich-json-body"><RichValue value={value} depth={0} /></div>
    <footer>Presentation is inferred from value shapes. Use Structured or Raw to verify the exact agent payload.</footer>
  </div>;
}
