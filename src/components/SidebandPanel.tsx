"use client";

import { Activity, CircleAlert, RadioTower } from "lucide-react";
import type { SidebandEvent } from "@/shared/evidence/types";
import { PartRenderer } from "./PartRenderer";

export function SidebandEventView({ event, allowRaw = false, compact = false }: { event: SidebandEvent; allowRaw?: boolean; compact?: boolean }) {
  return (
    <article className={`sideband-event ${event.level} ${compact ? "compact" : ""}`}>
      <header>
        <span className="sideband-icon">{event.level === "warning" || event.level === "error" ? <CircleAlert size={14} /> : <Activity size={14} />}</span>
        <div><strong>{event.title}</strong><span>{event.type}</span></div>
        <time>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
      </header>
      <div className="sideband-parts">{event.parts.map((part, index) => <PartRenderer key={`${event.id}-${part.id}-${index}`} part={part} allowRaw={allowRaw} />)}</div>
      {!compact && <footer>
        {event.references?.taskId && <span>task <code>{event.references.taskId}</code></span>}
        {event.references?.traceId && <span>trace <code>{event.references.traceId}</code></span>}
        <span title={event.extensionUri}>extension <code>{event.extensionUri}</code></span>
      </footer>}
    </article>
  );
}

export function SidebandPanel({ events, allowRaw = false }: { events: SidebandEvent[]; allowRaw?: boolean }) {
  return (
    <section className="sideband-page">
      <header className="section-heading">
        <div><h1>Sideband events</h1><p>Optional execution context contributed by a negotiated A2A extension.</p></div>
        <span className="count-pill">{events.length}</span>
      </header>
      {!events.length ? <div className="empty-card"><RadioTower size={27} /><strong>No sideband events</strong><p>This agent has not emitted sideband content in the current session.</p></div> :
        <div className="sideband-list">{events.map((event) => <SidebandEventView key={event.id} event={event} allowRaw={allowRaw} />)}</div>}
    </section>
  );
}
