"use client";

import { Activity, CircleAlert, RadioTower } from "lucide-react";
import type { SidebandEvent } from "@/shared/evidence/types";
import { PartRenderer } from "./PartRenderer";

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function A2AWrapperSummary({ event }: { event: SidebandEvent }) {
  if (event.metadata?.adapter !== "a2a-wrapper") return null;
  const dataPart = event.parts.find((part) => part.kind === "data" && isObject(part.value));
  const data = dataPart && isObject(dataPart.value) ? dataPart.value : {};
  const usage = isObject(data.usage) ? data.usage : undefined;
  const facts = [
    typeof data.toolKind === "string" ? ["Tool", data.toolKind] : undefined,
    typeof data.status === "string" ? ["Status", data.status] : undefined,
    typeof data.backend === "string" ? ["Backend", data.backend] : undefined,
  ].filter((value): value is string[] => Boolean(value));

  return <div className="wrapper-sideband-summary">
    <div><strong>a2a-wrapper</strong><span>Known compatibility adapter · {String(event.metadata.traceType ?? event.type)}</span></div>
    {facts.length > 0 && <dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    {usage && <dl className="wrapper-usage">
      <div><dt>Input tokens</dt><dd>{Number(usage.input_tokens ?? 0).toLocaleString()}</dd></div>
      <div><dt>Cached input</dt><dd>{Number(usage.cached_input_tokens ?? 0).toLocaleString()}</dd></div>
      <div><dt>Output tokens</dt><dd>{Number(usage.output_tokens ?? 0).toLocaleString()}</dd></div>
      <div><dt>Reasoning tokens</dt><dd>{Number(usage.reasoning_output_tokens ?? 0).toLocaleString()}</dd></div>
    </dl>}
  </div>;
}

export function SidebandEventView({ event, allowRaw = false, richJson = false, compact = false, embedded = false }: { event: SidebandEvent; allowRaw?: boolean; richJson?: boolean; compact?: boolean; embedded?: boolean }) {
  return (
    <article className={`sideband-event ${event.level} ${compact ? "compact" : ""}`}>
      {!embedded && <header>
        <span className="sideband-icon">{event.level === "warning" || event.level === "error" ? <CircleAlert size={14} /> : <Activity size={14} />}</span>
        <div><strong>{event.title}</strong><span>{event.type}</span></div>
        <time>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
      </header>}
      <A2AWrapperSummary event={event} />
      <div className="sideband-parts">{event.parts.map((part, index) => <PartRenderer key={`${event.id}-${part.id}-${index}`} part={part} allowRaw={allowRaw} richJson={richJson} />)}</div>
      {(!compact || embedded) && <footer>
        {event.metadata?.adapter === "a2a-wrapper" && <span>adapter <code>a2a-wrapper</code></span>}
        {event.references?.taskId && <span>task <code>{event.references.taskId}</code></span>}
        {event.references?.traceId && <span>trace <code>{event.references.traceId}</code></span>}
        <span title={event.extensionUri}>extension <code>{event.extensionUri}</code></span>
      </footer>}
    </article>
  );
}

export function SidebandPanel({ events, allowRaw = false, richJson = false }: { events: SidebandEvent[]; allowRaw?: boolean; richJson?: boolean }) {
  return (
    <section className="sideband-page">
      <header className="section-heading">
        <div><h1>Sideband events</h1><p>Optional execution context contributed by a negotiated A2A extension.</p></div>
        <span className="count-pill">{events.length}</span>
      </header>
      {!events.length ? <div className="empty-card"><RadioTower size={27} /><strong>No sideband events</strong><p>This agent has not emitted sideband content in the current session.</p></div> :
        <div className="sideband-list">{events.map((event) => <SidebandEventView key={event.id} event={event} allowRaw={allowRaw} richJson={richJson} />)}</div>}
    </section>
  );
}
