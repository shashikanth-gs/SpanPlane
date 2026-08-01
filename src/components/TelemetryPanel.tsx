"use client";

import {
  Activity, Bot, BrainCircuit, CircleAlert, Cpu, Database, ExternalLink, Gauge, RefreshCw,
  ShieldAlert, Sparkles, Waypoints, Workflow, Wrench,
} from "lucide-react";
import type { RuntimePublicConfig, TelemetrySpan } from "@/shared/evidence/types";
import {
  genAiSpanInsight, summarizeGenAiSpans, type GenAiSpanCategory, type GenAiSpanInsight, type TelemetryDialect,
} from "@/lib/genai-telemetry";
import { normalizePart } from "@/lib/content";
import { PartRenderer } from "./PartRenderer";

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: value >= 100 ? 0 : 1 }).format(value);
}

function formatMilliseconds(value: number) {
  return value >= 1_000 ? `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)} s` : `${Math.round(value)} ms`;
}

export function telemetrySpanDuration(span: TelemetrySpan) {
  const duration = genAiSpanInsight(span).durationMs;
  return duration === undefined ? undefined : formatMilliseconds(duration);
}

function CategoryIcon({ category }: { category: GenAiSpanCategory }) {
  if (category === "model") return <BrainCircuit size={15} />;
  if (category === "agent") return <Bot size={15} />;
  if (category === "workflow") return <Workflow size={15} />;
  if (category === "tool") return <Wrench size={15} />;
  if (category === "retrieval" || category === "memory") return <Database size={15} />;
  if (category === "embedding") return <Sparkles size={15} />;
  if (category === "evaluation") return <Gauge size={15} />;
  return <Cpu size={15} />;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="genai-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function dialectLabel(dialect: TelemetryDialect) {
  if (dialect === "otel-genai") return "OTEL GenAI";
  if (dialect === "openinference") return "OpenInference";
  return "Legacy GenAI";
}

function semanticTitle(insight: GenAiSpanInsight) {
  if (insight.operation) return insight.operation.replaceAll("_", " ");
  return insight.category === "other" ? "Infrastructure" : insight.category;
}

function modelText(insight: GenAiSpanInsight) {
  if (insight.requestedModel && insight.responseModel && insight.requestedModel !== insight.responseModel) {
    return `${insight.requestedModel} → ${insight.responseModel}`;
  }
  return insight.responseModel ?? insight.requestedModel;
}

function SemanticDetails({ insight }: { insight: GenAiSpanInsight }) {
  const model = modelText(insight);
  const identity = [
    insight.provider && ["Provider", insight.provider],
    insight.legacySystem && ["Legacy system", insight.legacySystem],
    model && [insight.requestedModel !== insight.responseModel && insight.responseModel ? "Requested → actual model" : "Model", model],
    insight.agentName && ["Agent", insight.agentName],
    insight.agentVersion && ["Agent version", insight.agentVersion],
    insight.agentId && ["Agent ID", insight.agentId],
    insight.workflowName && ["Workflow", insight.workflowName],
    insight.conversationId && ["Conversation", insight.conversationId],
    insight.previousResponseId && ["Previous response", insight.previousResponseId],
    insight.responseId && ["Response", insight.responseId],
    insight.prompt?.name && ["Prompt", insight.prompt.name],
    insight.prompt?.version && ["Prompt version", insight.prompt.version],
    insight.embeddingDimension !== undefined && ["Embedding dimensions", formatNumber(insight.embeddingDimension)],
  ].filter(Boolean) as string[][];

  return <>
    {identity.length > 0 && <dl className="genai-facts">{identity.map(([label, value]) => <div key={label}><dt>{label}</dt><dd title={value}>{value}</dd></div>)}</dl>}
    <div className="genai-chip-row">
      {insight.streaming === true && <span>streaming</span>}
      {insight.conversationCompacted === true && <span>context compacted</span>}
      {insight.outputType && <span>output: {insight.outputType}</span>}
      {insight.finishReasons.map((reason) => <span className={reason.toLowerCase().includes("length") ? "attention" : ""} key={reason}>finish: {reason}</span>)}
      {insight.dialects.map((dialect) => <span className={dialect === "otel-genai" ? "standard" : "compatibility"} key={dialect}>{dialectLabel(dialect)}</span>)}
      {insight.usageDialect && <span className={insight.usageDialect === "otel-genai" ? "standard" : "compatibility"}>usage: {dialectLabel(insight.usageDialect)}</span>}
    </div>
    {insight.requestSettings.length > 0 && <section className="genai-subsection"><h4>Generation controls</h4><div className="genai-settings">{insight.requestSettings.map((setting) => <span key={setting.key}><b>{setting.label}</b>{Array.isArray(setting.value) ? setting.value.join(", ") : String(setting.value)}</span>)}</div></section>}
    {insight.tool && <section className="genai-domain-card"><Wrench size={15} /><div><strong>{insight.tool.name || "Tool execution"}</strong><span>{[insight.tool.type, insight.tool.callId && `call ${insight.tool.callId}`].filter(Boolean).join(" · ") || "No standardized tool identity attributes"}</span></div></section>}
    {insight.retrieval && <section className="genai-domain-card"><Database size={15} /><div><strong>{insight.retrieval.dataSourceId || "Retrieval"}</strong><span>{[insight.retrieval.topK !== undefined && `top K ${insight.retrieval.topK}`, insight.retrieval.documentCount !== undefined && `${insight.retrieval.documentCount} documents`].filter(Boolean).join(" · ") || "No result-count attributes"}</span></div></section>}
    {insight.memory && <section className="genai-domain-card"><Database size={15} /><div><strong>{insight.memory.storeId || "Memory operation"}</strong><span>{[insight.memory.recordCount !== undefined && `${insight.memory.recordCount} records`, insight.memory.recordId && `record ${insight.memory.recordId}`].filter(Boolean).join(" · ") || "No record-count attributes"}</span></div></section>}
    {insight.evaluations.length > 0 && <section className="genai-subsection"><h4>Evaluations</h4><div className="genai-evaluations">{insight.evaluations.map((evaluation, index) => <article key={`${evaluation.name}-${index}`}><div><strong>{evaluation.name || "Evaluation"}</strong>{evaluation.label && <span>{evaluation.label}</span>}</div>{evaluation.score !== undefined && <b>{formatNumber(evaluation.score)}</b>}{evaluation.explanation && <p>{evaluation.explanation}</p>}</article>)}</div></section>}
  </>;
}

function RawEvidence({ span, allowRaw, richJson }: { span: TelemetrySpan; allowRaw: boolean; richJson: boolean }) {
  if (!allowRaw) return null;
  return <details className="telemetry-raw"><summary>Raw OTEL evidence <span>{Object.keys(span.attributes).length} attributes · {span.events.length} events</span></summary><PartRenderer part={normalizePart({ data: span.raw, mediaType: "application/json" })} allowRaw richJson={richJson} /></details>;
}

export function TelemetrySpanView({ span, allowRaw, richJson = false, embedded = false, usageIncluded }: { span: TelemetrySpan; allowRaw: boolean; richJson?: boolean; embedded?: boolean; usageIncluded?: boolean }) {
  const insight = genAiSpanInsight(span);
  const statusError = span.statusCode.toUpperCase() === "ERROR" || Boolean(insight.errorType);
  const metrics = [
    insight.usage.inputTokens !== undefined && <Metric key="input" label="Input tokens" value={formatNumber(insight.usage.inputTokens)} detail={insight.usage.cacheReadTokens ? `${formatNumber(insight.usage.cacheReadTokens)} cache read` : undefined} />,
    insight.usage.outputTokens !== undefined && <Metric key="output" label="Output tokens" value={formatNumber(insight.usage.outputTokens)} detail={insight.usage.reasoningTokens ? `${formatNumber(insight.usage.reasoningTokens)} reasoning` : undefined} />,
    insight.usage.totalTokens !== undefined && <Metric key="total" label="Total tokens" value={formatNumber(insight.usage.totalTokens)} detail={insight.totalTokensDerived ? "derived from input + output" : "provider reported"} />,
    insight.usage.cacheCreationTokens !== undefined && <Metric key="cache-create" label="Cache write" value={formatNumber(insight.usage.cacheCreationTokens)} detail="included in input" />,
    insight.durationMs !== undefined && <Metric key="duration" label="Duration" value={formatMilliseconds(insight.durationMs)} />,
    insight.timeToFirstChunkMs !== undefined && <Metric key="ttfc" label="First chunk" value={formatMilliseconds(insight.timeToFirstChunkMs)} detail="provider reported" />,
    insight.outputTokensPerSecond !== undefined && <Metric key="rate" label="Output rate" value={`${formatNumber(insight.outputTokensPerSecond)} tok/s`} detail="derived" />,
  ].filter(Boolean);
  const hasTokenUsage = insight.usage.inputTokens !== undefined || insight.usage.outputTokens !== undefined || insight.usage.totalTokens !== undefined;

  return <article className={`trace-span semantic-span category-${insight.category} ${embedded ? "embedded" : ""}`}>
    {!embedded && <header><span className="span-kind-icon"><CategoryIcon category={insight.category} /></span><div><strong>{span.name}</strong><span>{span.kind} · {span.projectName}</span></div><div><b className={statusError ? "error" : ""}>{insight.errorType || span.statusCode}</b>{telemetrySpanDuration(span) && <time>{telemetrySpanDuration(span)}</time>}</div></header>}
    <div className="semantic-span-lead"><span className={`semantic-category ${insight.category}`}><CategoryIcon category={insight.category} />{semanticTitle(insight)}</span>{insight.provider && <span className="semantic-provider">{insight.provider}</span>}{modelText(insight) && <strong title={modelText(insight)}>{modelText(insight)}</strong>}{statusError && <span className="semantic-error"><CircleAlert size={13} />{insight.errorType || span.statusMessage || "error"}</span>}</div>
    {metrics.length > 0 && <div className="genai-metrics">{metrics}</div>}
    {hasTokenUsage && usageIncluded !== undefined && <div className={`usage-accounting ${usageIncluded ? "included" : "excluded"}`}><Gauge size={13} />{usageIncluded ? "Counted as a model call in trace totals" : "Repeated wrapper usage · excluded from trace totals"}</div>}
    {insight.recognized ? <SemanticDetails insight={insight} /> : <p className="infrastructure-description">No recognized OpenTelemetry GenAI semantic attributes. This span remains available as infrastructure evidence.</p>}
    {insight.sensitiveAttributeKeys.length > 0 && <div className="sensitive-telemetry"><ShieldAlert size={14} /><div><strong>{insight.sensitiveAttributeKeys.length} content-bearing attribute{insight.sensitiveAttributeKeys.length === 1 ? "" : "s"} captured</strong><span>Hidden from the semantic view because GenAI prompts, messages, queries, tool payloads, and memory content may contain sensitive data.</span></div></div>}
    <div className="span-identifiers"><span>trace <code>{span.traceId}</code></span><span>span <code>{span.spanId}</code></span>{span.parentSpanId && <span>parent <code>{span.parentSpanId}</code></span>}<span>{insight.semanticAttributeCount} GenAI attributes</span></div>
    <RawEvidence span={span} allowRaw={allowRaw} richJson={richJson} />
  </article>;
}

function TraceGroup({ spans, allowRaw, richJson }: { spans: TelemetrySpan[]; allowRaw: boolean; richJson: boolean }) {
  const summary = summarizeGenAiSpans(spans);
  const semantic = spans.filter((span) => genAiSpanInsight(span).recognized);
  const infrastructure = spans.filter((span) => !genAiSpanInsight(span).recognized);
  return <section className="semantic-trace-group">
    <header><div><span>Trace</span><code title={spans[0]?.traceId}>{spans[0]?.traceId}</code></div><div>{summary.durationMs !== undefined && <span>{formatMilliseconds(summary.durationMs)}</span>}<span>{semantic.length} AI spans</span><span>{infrastructure.length} infrastructure</span></div></header>
    {semantic.length > 0 ? <div className="semantic-trace-spans">{semantic.map((span) => <TelemetrySpanView key={`${span.projectId}-${span.spanId}`} span={span} allowRaw={allowRaw} richJson={richJson} usageIncluded={Object.values(genAiSpanInsight(span).usage).some((value) => value !== undefined) ? summary.usageSpanIds.includes(span.spanId) : undefined} />)}</div> : <div className="semantic-empty-trace"><Cpu size={18} /><span>This trace contains OTEL spans, but no recognized GenAI semantic attributes.</span></div>}
    {infrastructure.length > 0 && <details className="infrastructure-spans"><summary>Infrastructure spans <span>{infrastructure.length}</span></summary><div>{infrastructure.map((span) => <TelemetrySpanView key={`${span.projectId}-${span.spanId}`} span={span} allowRaw={allowRaw} richJson={richJson} />)}</div></details>}
  </section>;
}

export function TelemetryPanel({ config, spans, allowRaw, richJson = false, refreshing, onRefresh }: {
  config?: RuntimePublicConfig;
  spans: TelemetrySpan[];
  allowRaw: boolean;
  richJson?: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const telemetry = config?.telemetry;
  const summary = summarizeGenAiSpans(spans);
  const traces = [...spans.reduce((groups, span) => groups.set(span.traceId, [...(groups.get(span.traceId) ?? []), span]), new Map<string, TelemetrySpan[]>()).values()];
  return (
    <section className="telemetry-page">
      <header className="section-heading telemetry-heading">
        <div><h1>AI telemetry <span className="semantic-stability">OTEL GenAI · Development</span></h1><p>OpenTelemetry GenAI semantics translated into model, usage, agent, tool, retrieval, and evaluation evidence.</p></div>
        <button className="button secondary" onClick={onRefresh} disabled={refreshing || telemetry?.provider !== "phoenix"}><RefreshCw className={refreshing ? "spin" : ""} size={14} />Refresh traces</button>
      </header>
      <section className="telemetry-runtime-card">
        <div className="telemetry-provider"><Waypoints size={19} /><div><strong>{telemetry?.provider === "phoenix" ? "Phoenix trace provider" : "No trace provider"}</strong><span>{telemetry?.provider === "phoenix" ? telemetry.status : "Start without --telemetry off to enable local OTLP ingestion."}</span></div>{telemetry?.uiUrl && <a href={telemetry.uiUrl} target="_blank" rel="noreferrer">Open Phoenix <ExternalLink size={13} /></a>}</div>
        {telemetry?.provider === "phoenix" && <dl><div><dt>OTLP / HTTP</dt><dd><code>{telemetry.otlpHttpEndpoint}</code></dd></div><div><dt>OTLP / gRPC</dt><dd><code>{telemetry.otlpGrpcEndpoint || "Not configured"}</code></dd></div></dl>}
      </section>
      {!spans.length ? <div className="empty-card telemetry-empty"><Activity size={27} /><strong>No correlated spans yet</strong><p>To see or receive Gen AI metrics and telemetry data, please point your OTel-compliant agent to the built-in collector endpoint.</p>
      {telemetry?.provider === "phoenix" && (
        <div style={{ marginTop: 20, textAlign: 'left', width: '100%', maxWidth: 520, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: 20 }}>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>Set these environment variables for your agent:</p>
          <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>HTTP / Protobuf</span>
          <pre style={{ background: 'var(--background)', border: '1px solid var(--line)', padding: 12, borderRadius: 8, fontSize: 12, marginBottom: 20, overflowX: 'auto', color: 'var(--text)' }}><code>export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=&quot;{telemetry.otlpHttpEndpoint}&quot;
export OTEL_EXPORTER_OTLP_PROTOCOL=&quot;http/protobuf&quot;</code></pre>
          
          <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>gRPC</span>
          <pre style={{ margin: 0, background: 'var(--background)', border: '1px solid var(--line)', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto', color: 'var(--text)' }}><code>export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=&quot;{telemetry.otlpGrpcEndpoint || "http://127.0.0.1:4317"}&quot;
export OTEL_EXPORTER_OTLP_PROTOCOL=&quot;grpc&quot;</code></pre>
        </div>
      )}
      </div> : <>
        <section className="genai-session-summary">
          <header><div><BrainCircuit size={18} /><div><strong>GenAI execution summary</strong><span>Duplicate-safe usage across {summary.traceCount} trace{summary.traceCount === 1 ? "" : "s"}</span></div></div><span>{summary.genAiSpanCount} recognized AI spans</span></header>
          <div className="summary-metrics">
            <Metric label="Input tokens" value={summary.meteredCallCount ? formatNumber(summary.usage.inputTokens) : "Not reported"} detail={[summary.usage.cacheReadTokens && `${formatNumber(summary.usage.cacheReadTokens)} read`, summary.usage.cacheCreationTokens && `${formatNumber(summary.usage.cacheCreationTokens)} write`].filter(Boolean).join(" · ") || undefined} />
            <Metric label="Output tokens" value={summary.meteredCallCount ? formatNumber(summary.usage.outputTokens) : "Not reported"} detail={summary.usage.reasoningTokens ? `${formatNumber(summary.usage.reasoningTokens)} reasoning` : undefined} />
            <Metric label="Total tokens" value={summary.meteredCallCount ? formatNumber(summary.usage.totalTokens) : "Not reported"} detail={summary.meteredCallCount ? `${summary.meteredCallCount} metered call${summary.meteredCallCount === 1 ? "" : "s"}` : "No usage attributes"} />
            <Metric label="Tool spans" value={formatNumber(summary.toolCallCount)} />
            <Metric label="Errors" value={formatNumber(summary.errorCount)} />
            {summary.averageTimeToFirstChunkMs !== undefined && <Metric label="Avg first chunk" value={formatMilliseconds(summary.averageTimeToFirstChunkMs)} detail="provider reported" />}
          </div>
          {summary.usageReportingState !== "reported" && <div className="telemetry-coverage-warning"><CircleAlert size={15} /><div><strong>{summary.usageReportingState === "no-model-spans" ? "No model spans were exported" : "Model spans omit token usage"}</strong><span>{summary.usageReportingState === "no-model-spans" ? "Agent-level telemetry is present, but token usage cannot be recovered without an exported model invocation span." : "The model invocation is visible, but none of its recognized OTEL GenAI, legacy GenAI, or OpenInference attributes contains token counts."}</span></div></div>}
          <div className="model-inventory"><div><span>Models</span>{summary.models.length ? summary.models.map((model) => <code key={model}>{model}</code>) : <small>Not reported</small>}</div><div><span>Providers</span>{summary.providers.length ? summary.providers.map((provider) => <code key={provider}>{provider}</code>) : <small>Not reported</small>}</div><div><span>Telemetry dialects</span>{summary.dialects.length ? summary.dialects.map((dialect) => <code key={dialect}>{dialectLabel(dialect)}</code>) : <small>Generic OTEL only</small>}</div></div>
          <p><ShieldAlert size={13} />Token totals count the deepest matching usage span so framework wrappers do not double-count the same model call. Content-bearing attributes remain hidden unless raw evidence is enabled.</p>
        </section>
        <div className="semantic-traces">{traces.map((traceSpans) => <TraceGroup key={traceSpans[0].traceId} spans={traceSpans} allowRaw={allowRaw} richJson={richJson} />)}</div>
      </>}
    </section>
  );
}
