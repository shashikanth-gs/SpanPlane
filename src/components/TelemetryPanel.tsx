"use client";

import { Activity, Box, ExternalLink, RefreshCw, Waypoints } from "lucide-react";
import type { RuntimePublicConfig, TelemetrySpan } from "@/shared/evidence/types";
import { normalizePart } from "@/lib/content";
import { PartRenderer } from "./PartRenderer";

function duration(span: TelemetrySpan) {
  if (!span.startTime || !span.endTime) return undefined;
  const milliseconds = new Date(span.endTime).getTime() - new Date(span.startTime).getTime();
  return Number.isFinite(milliseconds) ? `${milliseconds.toLocaleString()} ms` : undefined;
}

export function TelemetryPanel({ config, spans, allowRaw, refreshing, onRefresh }: {
  config?: RuntimePublicConfig;
  spans: TelemetrySpan[];
  allowRaw: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const telemetry = config?.telemetry;
  return (
    <section className="telemetry-page">
      <header className="section-heading">
        <div><h1>OpenTelemetry</h1><p>Trace and span evidence correlated through propagated W3C trace context.</p></div>
        <button className="button secondary" onClick={onRefresh} disabled={refreshing || telemetry?.provider !== "phoenix"}><RefreshCw className={refreshing ? "spin" : ""} size={14} />Refresh traces</button>
      </header>
      <section className="telemetry-runtime-card">
        <div className="telemetry-provider"><Waypoints size={19} /><div><strong>{telemetry?.provider === "phoenix" ? "Phoenix trace provider" : "No trace provider"}</strong><span>{telemetry?.provider === "phoenix" ? telemetry.status : "Start without --telemetry off to enable local OTLP ingestion."}</span></div>{telemetry?.uiUrl && <a href={telemetry.uiUrl} target="_blank" rel="noreferrer">Open Phoenix <ExternalLink size={13} /></a>}</div>
        {telemetry?.provider === "phoenix" && <dl><div><dt>OTLP / HTTP</dt><dd><code>{telemetry.otlpHttpEndpoint}</code></dd></div><div><dt>OTLP / gRPC</dt><dd><code>{telemetry.otlpGrpcEndpoint || "Not configured"}</code></dd></div></dl>}
      </section>
      {!spans.length ? <div className="empty-card telemetry-empty"><Activity size={27} /><strong>No correlated spans yet</strong><p>Instrumented agents can export OTLP to the endpoint above. Spans appear after a request shares the propagated trace context.</p></div> : <div className="trace-list">{spans.map((span) => <article className={`trace-span kind-${span.kind.toLowerCase()}`} key={`${span.projectId}-${span.spanId}`}>
        <header><span className="span-kind-icon"><Box size={14} /></span><div><strong>{span.name}</strong><span>{span.kind} · {span.projectName}</span></div><div><b>{span.statusCode}</b>{duration(span) && <time>{duration(span)}</time>}</div></header>
        <div className="span-identifiers"><span>trace <code>{span.traceId}</code></span><span>span <code>{span.spanId}</code></span>{span.parentSpanId && <span>parent <code>{span.parentSpanId}</code></span>}</div>
        <PartRenderer part={normalizePart({ data: { attributes: span.attributes, events: span.events }, mediaType: "application/json" })} allowRaw={allowRaw} />
      </article>)}</div>}
    </section>
  );
}
