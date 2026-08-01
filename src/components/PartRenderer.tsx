"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Code2, Download, Eye, FileText, Sparkles, Table2 } from "lucide-react";
import type { NormalizedPart } from "@/lib/workbench-types";
import { isTabular, parseCsv, safeContentUrl } from "@/lib/content";
import { canUseRichJsonView } from "@/lib/rich-json";
import { JsonTree } from "./JsonTree";
import { RichJsonView } from "./RichJsonView";

type View = "rendered" | "structured" | "experimental" | "raw";

function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = [...new Set(rows.flatMap(Object.keys))];
  return <div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{typeof row[column] === "object" ? JSON.stringify(row[column]) : String(row[column] ?? "")}</td>)}</tr>)}</tbody></table></div>;
}

function CsvTable({ text }: { text: string }) {
  const rows = useMemo(() => parseCsv(text), [text]);
  if (!rows.length) return null;
  return <div className="table-scroll"><table><thead><tr>{rows[0].map((cell, i) => <th key={i}>{cell}</th>)}</tr></thead><tbody>{rows.slice(1).map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

export function PartRenderer({ part, allowRaw = false, richJson = false }: { part: NormalizedPart; allowRaw?: boolean; richJson?: boolean }) {
  const [view, setView] = useState<View>("rendered");
  const url = typeof window === "undefined" ? undefined : safeContentUrl(part);
  const mime = part.mediaType || "application/octet-stream";
  const text = typeof part.value === "string" ? part.value : JSON.stringify(part.value, null, 2);
  const isJson = part.kind === "data" || mime.includes("json");
  const canStructure = isJson || (part.kind === "text" && mime.includes("csv"));
  const canUseExperimentalView = canUseRichJsonView(part, richJson);
  const activeView = (!allowRaw && view === "raw") || (!canUseExperimentalView && view === "experimental") ? "rendered" : view;
  return (
    <section className="part-card">
      <header className="part-toolbar">
        <div><span className="mime-badge">{mime}</span>{part.filename && <span className="part-filename">{part.filename}</span>}</div>
        <div className="segmented" aria-label="Content view">
          <button className={activeView === "rendered" ? "active" : ""} onClick={() => setView("rendered")} title="Rendered"><Eye size={14} /></button>
          {canStructure && <button className={activeView === "structured" ? "active" : ""} onClick={() => setView("structured")} title="Structured"><Table2 size={14} /></button>}
          {canUseExperimentalView && <button className={`experimental-view-toggle ${activeView === "experimental" ? "active" : ""}`} onClick={() => setView("experimental")} title="Experimental rich UI"><Sparkles size={13} /><span>Experimental</span></button>}
          {allowRaw && <button className={activeView === "raw" ? "active" : ""} onClick={() => setView("raw")} title="Raw"><Code2 size={14} /></button>}
        </div>
      </header>
      <div className="part-content">
        {activeView === "raw" ? <pre className="code-block">{JSON.stringify(part, null, 2)}</pre> :
          activeView === "experimental" ? <RichJsonView value={part.value} /> :
          activeView === "structured" && isJson ? (isTabular(part.value) ? <DataTable rows={part.value} /> : <JsonTree value={part.value} />) :
          activeView === "structured" && typeof part.value === "string" ? <CsvTable text={part.value} /> :
          mime.startsWith("image/") && url ? <a href={url} target="_blank" rel="noreferrer">{/* Agent URLs and data URIs are intentionally not passed through Next's image proxy. */}<img className="media-image" src={url} alt={part.filename || "Agent-generated image"} /></a> : // eslint-disable-line @next/next/no-img-element
          mime.startsWith("audio/") && url ? <audio controls src={url} /> :
          mime.startsWith("video/") && url ? <video className="media-video" controls src={url} /> :
          mime === "application/pdf" && url ? <div><iframe className="pdf-frame" src={url} title={part.filename || "PDF artifact"} sandbox="allow-same-origin" /><a className="download-link" href={url} download={part.filename}><Download size={14} />Download PDF</a></div> :
          isJson ? (isTabular(part.value) ? <DataTable rows={part.value} /> : <JsonTree value={part.value} />) :
          mime.includes("csv") && typeof part.value === "string" ? <CsvTable text={part.value} /> :
          (mime.includes("markdown") || (part.kind === "text" && /^\s*(#|[-*] |```|\|.+\|)/m.test(text))) ? <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div> :
          part.kind === "text" ? <div className="plain-text">{text}</div> :
          url ? <a className="file-download" href={url} download={part.filename}><FileText size={22} /><span>{part.filename || "Agent output"}<small>{mime}</small></span><Download size={16} /></a> :
          <pre className="code-block">{text}</pre>}
      </div>
    </section>
  );
}
