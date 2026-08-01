"use client";

import {
  Activity,
  Bot,
  Braces,
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FileJson,
  FileText,
  Layers3,
  MessageSquare,
  Network,
  PackageOpen,
  PanelRight,
  Play,
  Plus,
  Radio,
  Search,
  Send,
  Settings2,
  Sparkles,
  Terminal,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import styles from "./ExecutionExplorerPrototype.module.css";

type Scenario = "a2a" | "sideband" | "observed";
type View = "conversation" | "execution" | "artifacts" | "sideband";
type Source = "a2a" | "sideband" | "otel";
type SourceFilter = "all" | Source;
type ArtifactPart = "markdown" | "json" | "image" | "pdf";

type TimelineEvent = {
  id: string;
  at: string;
  duration?: string;
  title: string;
  detail: string;
  source: Source;
  tone?: "success" | "working" | "warning";
  kind: string;
  raw: Record<string, unknown>;
};

const scenarios: Record<Scenario, { label: string; summary: string }> = {
  a2a: { label: "A2A only", summary: "No optional signals" },
  sideband: { label: "+ Sideband", summary: "Agent events available" },
  observed: { label: "+ OTEL", summary: "Phoenix receives traces" },
};

const baseEvents: TimelineEvent[] = [
  {
    id: "message",
    at: "14:32:08.102",
    duration: "18 ms",
    title: "Message submitted",
    detail: "SendMessage · JSON-RPC",
    source: "a2a",
    tone: "success",
    kind: "message/send",
    raw: { jsonrpc: "2.0", method: "message/send", id: "req_8d2", params: { contextId: "ctx_241f", message: { role: "user", parts: [{ kind: "text", text: "Plan a 4-day food-focused trip to Kyoto." }] } } },
  },
  {
    id: "task-created",
    at: "14:32:08.121",
    duration: "4 ms",
    title: "Task created",
    detail: "state · submitted",
    source: "a2a",
    tone: "success",
    kind: "task",
    raw: { id: "task_7b1f", contextId: "ctx_241f", status: { state: "submitted", timestamp: "2026-07-29T09:02:08.121Z" } },
  },
  {
    id: "working",
    at: "14:32:08.169",
    duration: "1.42 s",
    title: "Agent working",
    detail: "task/status-update · working",
    source: "a2a",
    tone: "working",
    kind: "status-update",
    raw: { taskId: "task_7b1f", contextId: "ctx_241f", status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "Building a route around Nishiki Market and Gion…" }] } }, final: false },
  },
  {
    id: "progress",
    at: "14:32:08.194",
    duration: "640 ms",
    title: "Progress update",
    detail: "progress.updated · current 2 / total 4",
    source: "sideband",
    tone: "working",
    kind: "dev.a2a.workbench/progress",
    raw: { type: "dev.a2a.workbench/progress", version: "1", taskId: "task_7b1f", progress: { current: 2, total: 4, unit: "days", message: "Optimizing travel time" } },
  },
  {
    id: "tool-started",
    at: "14:32:08.356",
    title: "Tool started",
    detail: "tool.started · places.search",
    source: "sideband",
    tone: "working",
    kind: "dev.a2a.workbench/tool-started",
    raw: { type: "dev.a2a.workbench/tool-started", version: "1", taskId: "task_7b1f", tool: { name: "places.search", callId: "call_9fa", arguments: { query: "food markets" } } },
  },
  {
    id: "tool",
    at: "14:32:08.413",
    duration: "318 ms",
    title: "Tool completed",
    detail: "tool.completed · places.search",
    source: "sideband",
    tone: "success",
    kind: "tool.completed",
    raw: { type: "dev.a2a.workbench/tool-completed", tool: { name: "places.search", callId: "call_9fa", status: "ok", resultCount: 18 }, taskId: "task_7b1f" },
  },
  {
    id: "agent-span",
    at: "14:32:08.174",
    duration: "1.36 s",
    title: "travel-agent.run",
    detail: "AGENT · trace 7c0f…1e2a",
    source: "otel",
    tone: "success",
    kind: "span",
    raw: { traceId: "7c0f93ed4b1a4f39bc3a780f798c1e2a", spanId: "930e11f9c42b12f7", name: "travel-agent.run", kind: "INTERNAL", durationMs: 1362, attributes: { "gen_ai.operation.name": "invoke_agent", "gen_ai.agent.name": "Kyoto Travel Planner", "a2a.task.id": "task_7b1f", "a2a.context.id": "ctx_241f" } },
  },
  {
    id: "llm-span",
    at: "14:32:08.518",
    duration: "812 ms",
    title: "chat gpt-4.1-mini",
    detail: "LLM · 1,842 tokens",
    source: "otel",
    tone: "success",
    kind: "span",
    raw: { parentSpanId: "930e11f9c42b12f7", name: "chat gpt-4.1-mini", durationMs: 812, attributes: { "gen_ai.operation.name": "chat", "gen_ai.request.model": "gpt-4.1-mini", "gen_ai.usage.input_tokens": 1260, "gen_ai.usage.output_tokens": 582 } },
  },
  {
    id: "artifact",
    at: "14:32:09.544",
    duration: "12 ms",
    title: "Itinerary artifact",
    detail: "artifact/update · 4 parts",
    source: "a2a",
    tone: "success",
    kind: "artifact-update",
    raw: { taskId: "task_7b1f", artifact: { artifactId: "artifact_plan", name: "Kyoto food itinerary", parts: [{ kind: "text", metadata: { mimeType: "text/markdown" } }, { kind: "data", metadata: { mimeType: "application/json" } }, { kind: "file", file: { name: "kyoto-map.png", mimeType: "image/png" } }, { kind: "file", file: { name: "trip-plan.pdf", mimeType: "application/pdf" } }] }, append: false, lastChunk: true },
  },
  {
    id: "completed",
    at: "14:32:09.560",
    duration: "2 ms",
    title: "Task completed",
    detail: "task/status-update · completed",
    source: "a2a",
    tone: "success",
    kind: "status-update",
    raw: { taskId: "task_7b1f", contextId: "ctx_241f", status: { state: "completed", timestamp: "2026-07-29T09:02:09.560Z" }, final: true },
  },
];

const viewLabels: Array<{ id: View; label: string; icon: typeof MessageSquare }> = [
  { id: "conversation", label: "Conversation", icon: MessageSquare },
  { id: "execution", label: "Execution", icon: Activity },
  { id: "artifacts", label: "Artifacts", icon: Layers3 },
  { id: "sideband", label: "Sideband", icon: Zap },
];

function SourceBadge({ source }: { source: Source }) {
  return <span className={`${styles.sourceBadge} ${styles[source]}`}>{source === "sideband" ? "SIDEBAND" : source.toUpperCase()}</span>;
}

export function ExecutionExplorerPrototype() {
  const [scenario, setScenario] = useState<Scenario>("observed");
  const [view, setView] = useState<View>("conversation");
  const [selectedEventId, setSelectedEventId] = useState("llm-span");
  const [detailOpen, setDetailOpen] = useState(true);
  const [setupOpen, setSetupOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelection, setExportSelection] = useState({ a2a: true, artifacts: true, sideband: true, otel: true, timeline: true });
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [artifactPart, setArtifactPart] = useState<ArtifactPart>("markdown");
  const [artifactRaw, setArtifactRaw] = useState(false);
  const [message, setMessage] = useState("Plan a 4-day food-focused trip to Kyoto. Keep one afternoon free.");
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const events = useMemo(() => baseEvents.filter((event) => {
    if (scenario === "a2a") return event.source === "a2a";
    if (scenario === "sideband") return event.source !== "otel";
    return true;
  }), [scenario]);
  const visibleEvents = sourceFilter === "all" ? events : events.filter((event) => event.source === sourceFilter);

  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0];
  const sidebandActive = scenario !== "a2a";
  const otelActive = scenario === "observed";

  function chooseScenario(next: Scenario) {
    setScenario(next);
    if (next === "a2a" && sourceFilter !== "a2a") setSourceFilter("all");
    if (next === "sideband" && sourceFilter === "otel") setSourceFilter("all");
    if (next !== "observed" && selectedEvent?.source === "otel") setSelectedEventId("working");
    if (next === "a2a" && selectedEvent?.source === "sideband") setSelectedEventId("working");
  }

  function submitMessage() {
    if (!message.trim() || sending) return;
    setSending(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSending(false);
      setSentCount((count) => count + 1);
    }, 1300);
  }

  function copyEndpoint() {
    void navigator.clipboard?.writeText("http://127.0.0.1:6006/v1/traces");
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  async function exportSession() {
    const { strToU8, zipSync } = await import("fflate");
    const files: Record<string, Uint8Array> = {};
    const selectedEvents = baseEvents.filter((event) => (
      (event.source === "a2a" && exportSelection.a2a)
      || (event.source === "sideband" && exportSelection.sideband)
      || (event.source === "otel" && exportSelection.otel)
    ));

    files["manifest.json"] = strToU8(JSON.stringify({
      format: "spanplane-session",
      version: 1,
      exportedAt: new Date().toISOString(),
      contextId: "ctx_241f",
      taskId: "task_7b1f",
      included: exportSelection,
      timelineOrder: selectedEvents.map((event) => ({ id: event.id, source: event.source, timestamp: event.at })),
    }, null, 2));
    if (exportSelection.a2a) files["a2a/raw-events.json"] = strToU8(JSON.stringify(baseEvents.filter((event) => event.source === "a2a"), null, 2));
    if (exportSelection.sideband) files["sideband/raw-events.json"] = strToU8(JSON.stringify(baseEvents.filter((event) => event.source === "sideband"), null, 2));
    if (exportSelection.otel) files["otel/spans.json"] = strToU8(JSON.stringify(baseEvents.filter((event) => event.source === "otel"), null, 2));
    if (exportSelection.timeline) files["timeline/events.json"] = strToU8(JSON.stringify(selectedEvents, null, 2));
    if (exportSelection.artifacts) {
      files["artifacts/itinerary.md"] = strToU8("# A slower food journey through Kyoto\n\nMock artifact content from the agent response.\n");
      files["artifacts/route.json"] = strToU8(JSON.stringify({ city: "Kyoto", days: 4, artifactId: "artifact_plan" }, null, 2));
      files["artifacts/manifest.json"] = strToU8(JSON.stringify({ note: "A real export preserves every artifact part with its original bytes and MIME type.", parts: ["itinerary.md", "route.json", "kyoto-map.png", "trip-plan.pdf"] }, null, 2));
    }

    const archive = zipSync(files, { level: 6 });
    const blob = new Blob([archive], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "spanplane-ctx_241f.zip";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportOpen(false);
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}><img src="/icon.svg" width="17" height="17" alt="Logo" /></span>
          <span><strong>SpanPlane</strong><small>Execution explorer · concept</small></span>
        </div>
        <div className={styles.agentIdentity}>
          <span className={styles.agentAvatar}>KT</span>
          <span><strong>Kyoto Travel Planner</strong><small>http://localhost:4123</small></span>
          <span className={styles.liveDot}><i /> connected</span>
        </div>
        <div className={styles.topActions}>
          <button className={styles.iconButton} aria-label="Search session"><Search size={16} /></button>
          <button className={styles.iconButton} aria-label="Open setup" onClick={() => setSetupOpen(true)}><Settings2 size={16} /></button>
          <button className={styles.secondaryButton} onClick={() => setExportOpen(true)}><Download size={15} /> Export</button>
          <button className={styles.primaryButton} onClick={() => setSetupOpen(true)}><Plus size={15} /> New session</button>
        </div>
      </header>

      <section className={styles.contextBar}>
        <div className={styles.contextName}>
          <span>Kyoto food itinerary</span>
          <code>ctx_241f</code>
          <ChevronDown size={13} />
        </div>
        <div className={styles.contextMeta}><span><i /> Task completed</span><code>task_7b1f</code></div>
      </section>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeading}><span>Session</span><button aria-label="Create session" onClick={() => setSetupOpen(true)}><Plus size={14} /></button></div>
          <nav className={styles.navigation} aria-label="Session views">
            {viewLabels.map((item) => {
              const Icon = item.icon;
              const unavailable = item.id === "sideband" && scenario === "a2a";
              return (
                <button key={item.id} className={view === item.id ? styles.activeNav : ""} onClick={() => setView(item.id)}>
                  <Icon size={15} /><span>{item.label}</span>
                  {item.id === "artifacts" && <em>4</em>}
                  {item.id === "sideband" && <small>{unavailable ? "optional" : "3"}</small>}
                </button>
              );
            })}
          </nav>
          <div className={styles.sidebarSection}>
            <span>Evidence sources</span>
            <div className={styles.sourceList}>
              <div><i className={styles.a2aDot} /><span><strong>A2A</strong><small>Connected · v1.0</small></span><em>Required</em></div>
              <div className={!sidebandActive ? styles.sourceOff : ""}><i className={styles.sidebandDot} /><span><strong>Sideband events</strong><small>{sidebandActive ? "3 events received" : "Not advertised"}</small></span><em>Optional</em></div>
              <div className={!otelActive ? styles.sourceOff : ""}><i className={styles.otelDot} /><span><strong>OpenTelemetry</strong><small>{otelActive ? "4 spans via Phoenix" : "Not connected"}</small></span><em>Optional</em></div>
            </div>
            <button className={styles.exportButton} onClick={() => setExportOpen(true)}><Download size={15} /><span><strong>Export session</strong><small>Choose evidence and download ZIP</small></span></button>
          </div>
          <div className={styles.sidebarSection}>
            <span>Preview signal states</span>
            <div className={styles.scenarioPicker}>
              {(Object.keys(scenarios) as Scenario[]).map((key) => (
                <button key={key} className={scenario === key ? styles.activeScenario : ""} onClick={() => chooseScenario(key)}>
                  <i />
                  <span><strong>{scenarios[key].label}</strong><small>{scenarios[key].summary}</small></span>
                </button>
              ))}
            </div>
          </div>
          <div className={styles.sidebarFoot}>
            <Sparkles size={14} />
            <p><strong>Progressive visibility</strong><br />A2A remains complete and usable when optional signals are absent.</p>
          </div>
        </aside>

        <section className={styles.mainPanel}>
          {view === "conversation" && (
            <div className={styles.conversationView}>
              <header className={styles.viewHeader}>
                <div><span className={styles.viewIcon}><MessageSquare size={16} /></span><span><strong>Conversation</strong><small>What the user and agent exchanged</small></span></div>
                <div className={styles.headerMeta}><span><i /> completed</span><code>task_7b1f</code></div>
              </header>
              <div className={styles.transcript}>
                <div className={`${styles.message} ${styles.userMessage}`}>
                  <div className={styles.messageMeta}><strong>You</strong><time>14:32:08</time></div>
                  <div className={styles.userBubble}>Plan a 4-day food-focused trip to Kyoto. Keep one afternoon free.</div>
                </div>
                <div className={styles.message}>
                  <div className={styles.agentBadge}><Bot size={15} /></div>
                  <div className={styles.agentMessageBody}>
                    <div className={styles.messageMeta}><strong>Kyoto Travel Planner</strong><SourceBadge source="a2a" /><time>14:32:09</time></div>
                    <div className={styles.agentAnswer}>
                      <p>I built a four-day route that keeps travel compact and leaves Thursday afternoon open.</p>
                      {sidebandActive && (
                        <section className={styles.conversationEvents}>
                          <header><div><SourceBadge source="sideband" /><strong>Events received during this response</strong></div><button onClick={() => setView("sideband")}>View all</button></header>
                          <div className={styles.conversationEventRows}>
                            <button onClick={() => { setView("execution"); setSelectedEventId("progress"); setDetailOpen(true); }}><Zap size={14} /><span><strong>Progress update</strong><small>current 2 · total 4</small></span><time>14:32:08.194</time></button>
                            <button onClick={() => { setView("execution"); setSelectedEventId("tool-started"); setDetailOpen(true); }}><Wrench size={14} /><span><strong>Tool started</strong><small>places.search · call_9fa</small></span><time>14:32:08.356</time></button>
                            <button onClick={() => { setView("execution"); setSelectedEventId("tool"); setDetailOpen(true); }}><Check size={14} /><span><strong>Tool completed</strong><small>places.search · 318 ms</small></span><time>14:32:08.413</time></button>
                          </div>
                        </section>
                      )}
                      <div className={styles.itineraryGrid}>
                        <article><span>01</span><div><strong>Nishiki & Pontocho</strong><small>Market breakfast · tea tasting · riverside dinner</small></div><em>Mon</em></article>
                        <article><span>02</span><div><strong>Arashiyama</strong><small>Tofu lunch · bamboo grove · kaiseki</small></div><em>Tue</em></article>
                        <article><span>03</span><div><strong>Fushimi & Gion</strong><small>Sake district · wagashi workshop · izakaya</small></div><em>Wed</em></article>
                        <article><span>04</span><div><strong>Higashiyama</strong><small>Coffee · soba lunch · afternoon open</small></div><em>Thu</em></article>
                      </div>
                      <button className={styles.artifactLink} onClick={() => setView("artifacts")}><FileText size={14} /><span><strong>Kyoto food itinerary</strong><small>4 parts · Markdown, JSON, image, PDF</small></span><Eye size={14} /></button>
                    </div>
                    {otelActive && <div className={styles.inlineEvidence}><SourceBadge source="otel" /><span>Trace correlated by <code>a2a.task.id</code></span><button onClick={() => setView("execution")}>Open trace</button></div>}
                  </div>
                </div>
                {sentCount > 0 && (
                  <div className={styles.message}>
                    <div className={styles.agentBadge}><Bot size={15} /></div>
                    <div className={styles.agentMessageBody}>
                      <div className={styles.messageMeta}><strong>Kyoto Travel Planner</strong><SourceBadge source="a2a" /><time>now</time></div>
                      <div className={styles.agentAnswer}><p>I’ve updated the plan. The latest run has been added to the execution timeline.</p></div>
                    </div>
                  </div>
                )}
                {sending && <div className={styles.streaming}><span /><span /><span /> Agent is streaming an update</div>}
              </div>
              <div className={styles.composer}>
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submitMessage(); } }} aria-label="Message the agent" />
                <div className={styles.composerBar}>
                  <div><button><Plus size={15} /> Add file</button><button><Braces size={14} /> Text <ChevronDown size={12} /></button></div>
                  <div><span>Enter to send</span><button aria-label="Send message" className={styles.sendButton} disabled={sending || !message.trim()} onClick={submitMessage}>{sending ? <Radio size={15} /> : <Send size={15} />}</button></div>
                </div>
              </div>
            </div>
          )}

          {view === "execution" && (
            <div className={styles.executionView}>
              <header className={styles.viewHeader}>
                <div><span className={styles.viewIcon}><Activity size={16} /></span><span><strong>Execution</strong><small>One timeline, preserving every source</small></span></div>
                <div className={styles.legend}><SourceBadge source="a2a" />{sidebandActive && <SourceBadge source="sideband" />}{otelActive && <SourceBadge source="otel" />}</div>
              </header>
              <div className={styles.metrics}>
                <article><span>End-to-end</span><strong>1.46 <small>s</small></strong><em>message → completed</em></article>
                <article><span>A2A events</span><strong>5</strong><em>protocol evidence</em></article>
                <article><span>Sideband events</span><strong>{sidebandActive ? "3" : "—"}</strong><em>{sidebandActive ? "agent-provided" : "not provided"}</em></article>
                <article><span>OTEL spans</span><strong>{otelActive ? "4" : "—"}</strong><em>{otelActive ? "exact correlation" : "not connected"}</em></article>
              </div>
              <div className={styles.timelineToolbar}><div><button className={sourceFilter === "all" ? styles.activeFilter : ""} onClick={() => setSourceFilter("all")}>All</button><button className={sourceFilter === "a2a" ? styles.activeFilter : ""} onClick={() => setSourceFilter("a2a")}>A2A</button><button className={sourceFilter === "sideband" ? styles.activeFilter : ""} onClick={() => setSourceFilter("sideband")} disabled={!sidebandActive}>Sideband</button><button className={sourceFilter === "otel" ? styles.activeFilter : ""} onClick={() => setSourceFilter("otel")} disabled={!otelActive}>OTEL</button></div><button><Search size={14} /> Filter events</button></div>
              <div className={styles.timeline}>
                {visibleEvents.map((event) => (
                  <button key={event.id} className={`${styles.timelineRow} ${selectedEvent?.id === event.id ? styles.selectedTimeline : ""}`} onClick={() => { setSelectedEventId(event.id); setDetailOpen(true); }}>
                    <time>{event.at}</time>
                    <span className={`${styles.eventNode} ${styles[event.source]}`} />
                    <span className={styles.eventBody}><span><SourceBadge source={event.source} /><strong>{event.title}</strong></span><small>{event.detail}</small></span>
                    <code>{event.duration}</code>
                  </button>
                ))}
              </div>
              {!otelActive && (
                <div className={styles.emptyEnrichment}><Network size={18} /><span><strong>Want implementation-level detail?</strong><small>A2A data above is complete. Connect an OTEL exporter to add traces and AI metrics.</small></span><button onClick={() => setSetupOpen(true)}>Set up tracing</button></div>
              )}
            </div>
          )}

          {view === "artifacts" && (
            <div className={styles.artifactsView}>
              <header className={styles.viewHeader}>
                <div><span className={styles.viewIcon}><Layers3 size={16} /></span><span><strong>Artifacts</strong><small>Rendered from the content the agent returned</small></span></div>
                <span className={styles.countLabel}>1 artifact · 4 parts</span>
              </header>
              <div className={styles.artifactWorkspace}>
                <aside><span>Task output</span><button className={styles.activeArtifact}><FileText size={15} /><span><strong>Kyoto food itinerary</strong><small>artifact_plan</small></span><em>4</em></button></aside>
                <section>
                  <div className={styles.artifactHeader}><div><strong>Kyoto food itinerary</strong><span>Complete</span></div><small>Content-aware views inferred from each artifact part</small></div>
                  <div className={styles.partTabs}><button className={artifactPart === "markdown" ? styles.activePart : ""} onClick={() => { setArtifactPart("markdown"); setArtifactRaw(false); }}><FileText size={14} /> Itinerary.md</button><button className={artifactPart === "json" ? styles.activePart : ""} onClick={() => setArtifactPart("json")}><FileJson size={14} /> route.json</button><button className={artifactPart === "image" ? styles.activePart : ""} onClick={() => setArtifactPart("image")}><Eye size={14} /> map.png</button><button className={artifactPart === "pdf" ? styles.activePart : ""} onClick={() => setArtifactPart("pdf")}><FileText size={14} /> trip-plan.pdf</button></div>
                  <article className={styles.documentPreview}>
                    <div className={styles.documentToolbar}><span><SourceBadge source="a2a" /> {artifactPart === "markdown" ? "text/markdown" : artifactPart === "json" ? "application/json" : artifactPart === "image" ? "image/png" : "application/pdf"}</span>{artifactPart === "markdown" && <div><button className={!artifactRaw ? styles.activeDocumentMode : ""} onClick={() => setArtifactRaw(false)}>Rendered</button><button className={artifactRaw ? styles.activeDocumentMode : ""} onClick={() => setArtifactRaw(true)}>Raw</button></div>}</div>
                    {artifactPart === "markdown" && !artifactRaw && <div className={styles.documentBody}><span>KYOTO · 4 DAYS</span><h1>A slower food journey through Kyoto</h1><p>Four compact neighborhood days, planned around morning markets, local workshops, and unhurried dinners.</p><hr /><h2>Day 1 · Nishiki & Pontocho</h2><p>Start at Nishiki Market before the crowds. Continue through Teramachi, pause for a tea flight, then cross to Pontocho for dinner by the river.</p><div><strong>09:00</strong><span>Nishiki Market breakfast</span><strong>14:30</strong><span>Uji tea tasting</span><strong>19:00</strong><span>Seasonal kaiseki</span></div></div>}
                    {artifactPart === "markdown" && artifactRaw && <pre className={styles.rawArtifact}>{"# A slower food journey through Kyoto\n\nFour compact neighborhood days, planned around morning markets, local workshops, and unhurried dinners.\n\n## Day 1 · Nishiki & Pontocho\n\n- **09:00** Nishiki Market breakfast\n- **14:30** Uji tea tasting\n- **19:00** Seasonal kaiseki"}</pre>}
                    {artifactPart === "json" && <pre className={styles.rawArtifact}>{JSON.stringify({ city: "Kyoto", days: 4, focus: ["food", "markets", "tea"], freeTime: { day: 4, period: "afternoon" }, stops: [{ day: 1, area: "Nishiki & Pontocho", reservations: 1 }, { day: 2, area: "Arashiyama", reservations: 2 }] }, null, 2)}</pre>}
                    {artifactPart === "image" && <div className={styles.mapPreview}><div className={styles.mapRoute}><i /><i /><i /><i /></div><span>KYOTO</span><strong>4-day neighborhood route</strong><small>Agent-provided image rendered inline</small></div>}
                    {artifactPart === "pdf" && <div className={styles.pdfPreview}><FileText size={30} /><span><strong>trip-plan.pdf</strong><small>8 pages · application/pdf</small></span><button>Open PDF preview</button></div>}
                  </article>
                </section>
              </div>
            </div>
          )}

          {view === "sideband" && (
            <div className={styles.sidebandView}>
              <header className={styles.viewHeader}>
                <div><span className={styles.viewIcon}><Zap size={16} /></span><span><strong>Sideband events</strong><small>Optional events emitted by the agent alongside A2A</small></span></div>
                <button className={styles.secondaryButton} onClick={() => setSetupOpen(true)}><Settings2 size={14} /> Configure</button>
              </header>
              {scenario === "a2a" ? (
                <div className={styles.optionalEmpty}><span><Zap size={24} /></span><h2>No sideband event extension advertised</h2><p>This session still contains the complete A2A conversation, task updates, streaming events, and artifacts. Sideband events are optional agent-provided context.</p><button onClick={() => chooseScenario("sideband")}>Preview sideband events</button></div>
              ) : (
                <div className={styles.sidebandContent}>
                  <div className={styles.evidenceSummary}>
                    <div><strong>3</strong><span>Events received</span></div>
                    <div><strong>1</strong><span>Progress update</span></div>
                    <div><strong>1</strong><span>Tool invocation</span></div>
                    <p>Raw agent-provided extension evidence, organized without changing or interpreting the payload.</p>
                  </div>
                  <section className={styles.sidebandStream}>
                    <header><div><Zap size={16} /><span><strong>Event stream</strong><small>Ordered using the original event timestamps</small></span></div><SourceBadge source="sideband" /></header>
                    <button onClick={() => { setView("execution"); setSelectedEventId("progress"); setDetailOpen(true); }}><time>14:32:08.194</time><span><strong>dev.a2a.workbench/progress</strong><small>current: 2 · total: 4 · unit: days</small></span><code>task_7b1f</code></button>
                    <button onClick={() => { setView("execution"); setSelectedEventId("tool-started"); setDetailOpen(true); }}><time>14:32:08.356</time><span><strong>dev.a2a.workbench/tool-started</strong><small>places.search · callId: call_9fa</small></span><code>task_7b1f</code></button>
                    <button onClick={() => { setView("execution"); setSelectedEventId("tool"); setDetailOpen(true); }}><time>14:32:08.413</time><span><strong>dev.a2a.workbench/tool-completed</strong><small>places.search · status: ok · duration: 318 ms</small></span><code>task_7b1f</code></button>
                  </section>
                  <div className={styles.sidebandLowerGrid}>
                    <section className={styles.toolPanel}>
                      <header><Wrench size={16} /><span><strong>Tool calls</strong><small>Derived only from tool sideband events</small></span></header>
                      <div className={styles.toolCall}><span className={styles.toolIcon}><Terminal size={16} /></span><span><strong>places.search</strong><small>call_9fa · started 14:32:08.356</small></span><div><strong>completed</strong><small>318 ms</small></div></div>
                      <dl><div><dt>Arguments</dt><dd><code>{'{ "query": "food markets" }'}</code></dd></div><div><dt>Observed result</dt><dd>18 results</dd></div></dl>
                    </section>
                    <section className={styles.otelPanel}>
                      <header><Network size={16} /><span><strong>OpenTelemetry enrichment</strong><small>{otelActive ? "Correlated trace data" : "No OTEL data received"}</small></span></header>
                      {otelActive ? <><div className={styles.otelFacts}><div><span>Token usage</span><strong>1,842</strong></div><div><span>Correlation</span><strong>Exact</strong></div></div><p><code>a2a.task.id</code> matched the trace to this task. Usage comes from GenAI semantic attributes.</p></> : <p>Point an OTLP exporter at the Workbench receiver to add spans and AI usage data.</p>}
                    </section>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {detailOpen && view === "execution" && selectedEvent && (
          <aside className={styles.detailPanel}>
            <header><div><span>Event detail</span><strong>{selectedEvent.title}</strong></div><button aria-label="Close event detail" onClick={() => setDetailOpen(false)}><X size={16} /></button></header>
            <div className={styles.detailSummary}><SourceBadge source={selectedEvent.source} /><span>{selectedEvent.kind}</span><em>{selectedEvent.duration}</em></div>
            <div className={styles.detailFacts}><div><span>Timestamp</span><code>{selectedEvent.at}</code></div><div><span>Task</span><code>task_7b1f</code></div><div><span>Context</span><code>ctx_241f</code></div><div><span>Correlation</span><strong>{selectedEvent.source === "otel" ? "Exact" : "Native"}</strong></div></div>
            <div className={styles.rawHeading}><span>Raw evidence</span><button><Copy size={13} /> Copy</button></div>
            <pre>{JSON.stringify(selectedEvent.raw, null, 2)}</pre>
            <div className={styles.evidenceNote}><Eye size={14} /><p><strong>Source preserved</strong><br />The semantic view never replaces this original payload.</p></div>
          </aside>
        )}
        {!detailOpen && view === "execution" && <button className={styles.reopenDetail} onClick={() => setDetailOpen(true)}><PanelRight size={16} /></button>}
      </div>

      {setupOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSetupOpen(false); }}>
          <section className={styles.setupModal} role="dialog" aria-modal="true" aria-labelledby="setup-title">
            <header><div><span className={styles.viewIcon}><Network size={17} /></span><span><strong id="setup-title">New agent session</strong><small>Start with A2A. Add richer signals only when available.</small></span></div><button aria-label="Close setup" onClick={() => setSetupOpen(false)}><X size={17} /></button></header>
            <div className={styles.setupBody}>
              <section className={styles.setupStep}><span className={styles.stepNumber}>1</span><div><div className={styles.stepTitle}><span><strong>Connect the agent</strong><small>Required · standard A2A</small></span><span className={styles.requiredPill}>Required</span></div><label>Agent Card URL<input defaultValue="http://localhost:4123/.well-known/agent-card.json" /></label><div className={styles.detected}><Check size={14} /><span><strong>Kyoto Travel Planner detected</strong><small>A2A v1.0 · JSON-RPC · streaming · 3 skills</small></span></div></div></section>
              <section className={styles.setupStep}><span className={styles.stepNumber}>2</span><div><div className={styles.stepTitle}><span><strong>Sideband events</strong><small>Optional · sent through an advertised A2A extension</small></span><span className={styles.optionalPill}>Optional</span></div><div className={styles.extensionRow}><span><Activity size={15} /><span><strong>Workbench sideband events v1</strong><small>{sidebandActive ? "Advertised by this agent" : "Not advertised by this agent"}</small></span></span><button aria-label="Toggle sideband events" className={sidebandActive ? styles.toggleOn : styles.toggleOff} onClick={() => chooseScenario(sidebandActive ? "a2a" : "sideband")}><i /></button></div></div></section>
              <section className={styles.setupStep}><span className={styles.stepNumber}>3</span><div><div className={styles.stepTitle}><span><strong>OpenTelemetry</strong><small>Optional · point your existing OTLP exporter here</small></span><span className={styles.optionalPill}>Optional</span></div><div className={styles.phoenixCard}><div><span className={styles.phoenixLogo}><Sparkles size={15} /></span><span><strong>Embedded Phoenix</strong><small>{otelActive ? "Collector is running and receiving spans" : "Start a local collector for this session"}</small></span><button className={otelActive ? styles.stopButton : styles.startButton} onClick={() => chooseScenario(otelActive ? (sidebandActive ? "sideband" : "a2a") : "observed")}>{otelActive ? "Stop" : <><Play size={12} /> Start</>}</button></div>{otelActive && <div className={styles.endpointBox}><span><i /> OTLP/HTTP endpoint</span><code>http://127.0.0.1:6006/v1/traces</code><button onClick={copyEndpoint}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}</button></div>}</div><p className={styles.setupHint}>Your agent stays independent. Workbench only receives the telemetry it exports; Phoenix remains replaceable with another trace provider.</p></div></section>
            </div>
            <footer><span><Check size={14} /> Ready to capture standard A2A events</span><button className={styles.secondaryButton} onClick={() => setSetupOpen(false)}>Cancel</button><button className={styles.primaryButton} onClick={() => setSetupOpen(false)}>Start session</button></footer>
          </section>
        </div>
      )}

      {exportOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExportOpen(false); }}>
          <section className={`${styles.setupModal} ${styles.exportModal}`} role="dialog" aria-modal="true" aria-labelledby="export-title">
            <header><div><span className={styles.viewIcon}><PackageOpen size={17} /></span><span><strong id="export-title">Export session evidence</strong><small>Create a portable ZIP containing the original data and timeline.</small></span></div><button aria-label="Close export" onClick={() => setExportOpen(false)}><X size={17} /></button></header>
            <div className={styles.exportBody}>
              <div className={styles.exportIntro}><span><strong>Kyoto food itinerary</strong><code>ctx_241f · task_7b1f</code></span><em>ZIP archive</em></div>
              <p>Select what to include. Every selected source is exported without changing its original payload, and the manifest records the combined event order.</p>
              <div className={styles.exportOptions}>
                {([
                  ["a2a", "A2A protocol evidence", "Raw messages, task updates, streaming events and metadata", "5 events"],
                  ["artifacts", "Agent artifacts", "Original parts, filenames, MIME types and artifact metadata", "4 parts"],
                  ["sideband", "Sideband events", "Progress, tools and any other agent-provided extension events", sidebandActive ? "3 events" : "Not available"],
                  ["otel", "OpenTelemetry data", "Spans, attributes, resource data and GenAI usage fields", otelActive ? "4 spans" : "Not available"],
                  ["timeline", "Combined timeline", "Ordered index linking all selected evidence by task and context", "JSON"],
                ] as const).map(([key, label, description, count]) => (
                  <label key={key} className={(key === "sideband" && !sidebandActive) || (key === "otel" && !otelActive) ? styles.exportUnavailable : ""}>
                    <input type="checkbox" checked={exportSelection[key]} disabled={(key === "sideband" && !sidebandActive) || (key === "otel" && !otelActive)} onChange={(event) => setExportSelection((current) => ({ ...current, [key]: event.target.checked }))} />
                    <span className={styles.exportCheck}><Check size={13} /></span>
                    <span><strong>{label}</strong><small>{description}</small></span>
                    <em>{count}</em>
                  </label>
                ))}
              </div>
              <div className={styles.exportStructure}><FileJson size={15} /><span><strong>Archive structure</strong><small>manifest.json · a2a/ · artifacts/ · sideband/ · otel/ · timeline/</small></span></div>
            </div>
            <footer><span>Only captured data is included.</span><button className={styles.secondaryButton} onClick={() => setExportOpen(false)}>Cancel</button><button className={styles.primaryButton} disabled={!Object.values(exportSelection).some(Boolean)} onClick={() => void exportSession()}><Download size={14} /> Download ZIP</button></footer>
          </section>
        </div>
      )}
    </main>
  );
}
