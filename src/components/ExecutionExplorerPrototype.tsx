"use client";

import {
  Activity,
  Bot,
  Braces,
  Check,
  ChevronDown,
  Circle,
  Clock3,
  Copy,
  Database,
  Eye,
  FileJson,
  FileText,
  Gauge,
  Layers3,
  MessageSquare,
  MoreHorizontal,
  Network,
  PanelRight,
  Play,
  Plus,
  Radio,
  Search,
  Send,
  Settings2,
  Sparkles,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import styles from "./ExecutionExplorerPrototype.module.css";

type Scenario = "a2a" | "diagnostics" | "observed";
type View = "conversation" | "execution" | "artifacts" | "diagnostics";
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
  a2a: { label: "A2A only", summary: "No instrumentation required" },
  diagnostics: { label: "+ diagnostics", summary: "Sideband events available" },
  observed: { label: "+ traces", summary: "Phoenix receives OTEL" },
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
    title: "Planning itinerary",
    detail: "progress · 2 of 4 days",
    source: "sideband",
    tone: "working",
    kind: "dev.a2a.workbench/progress",
    raw: { type: "dev.a2a.workbench/progress", version: "1", taskId: "task_7b1f", progress: { current: 2, total: 4, unit: "days", message: "Optimizing travel time" } },
  },
  {
    id: "tool",
    at: "14:32:08.413",
    duration: "318 ms",
    title: "Search places",
    detail: "tool · places.search",
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
  { id: "diagnostics", label: "Diagnostics", icon: Gauge },
];

function SourceBadge({ source }: { source: Source }) {
  return <span className={`${styles.sourceBadge} ${styles[source]}`}>{source === "sideband" ? "DIAG" : source.toUpperCase()}</span>;
}

function Capability({ state, label, detail }: { state: "required" | "active" | "off"; label: string; detail: string }) {
  return (
    <div className={`${styles.capability} ${styles[state]}`}>
      <span className={styles.capabilityIcon}>{state === "active" || state === "required" ? <Check size={13} /> : <Circle size={10} />}</span>
      <span><strong>{label}</strong><small>{detail}</small></span>
    </div>
  );
}

export function ExecutionExplorerPrototype() {
  const [scenario, setScenario] = useState<Scenario>("observed");
  const [view, setView] = useState<View>("conversation");
  const [selectedEventId, setSelectedEventId] = useState("llm-span");
  const [detailOpen, setDetailOpen] = useState(true);
  const [setupOpen, setSetupOpen] = useState(false);
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
    if (scenario === "diagnostics") return event.source !== "otel";
    return true;
  }), [scenario]);
  const visibleEvents = sourceFilter === "all" ? events : events.filter((event) => event.source === sourceFilter);

  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0];
  const sidebandActive = scenario !== "a2a";
  const otelActive = scenario === "observed";

  function chooseScenario(next: Scenario) {
    setScenario(next);
    if (next === "a2a" && sourceFilter !== "a2a") setSourceFilter("all");
    if (next === "diagnostics" && sourceFilter === "otel") setSourceFilter("all");
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

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}><Activity size={17} /></span>
          <span><strong>A2A Workbench</strong><small>Execution explorer · concept</small></span>
        </div>
        <div className={styles.agentIdentity}>
          <span className={styles.agentAvatar}>KT</span>
          <span><strong>Kyoto Travel Planner</strong><small>http://localhost:4123</small></span>
          <span className={styles.liveDot}><i /> connected</span>
        </div>
        <div className={styles.topActions}>
          <button className={styles.iconButton} aria-label="Search session"><Search size={16} /></button>
          <button className={styles.iconButton} aria-label="Open setup" onClick={() => setSetupOpen(true)}><Settings2 size={16} /></button>
          <button className={styles.primaryButton} onClick={() => setSetupOpen(true)}><Plus size={15} /> New session</button>
        </div>
      </header>

      <section className={styles.contextBar}>
        <div className={styles.contextName}>
          <span>Kyoto food itinerary</span>
          <code>ctx_241f</code>
          <ChevronDown size={13} />
        </div>
        <div className={styles.capabilityStrip}>
          <Capability state="required" label="A2A" detail="v1.0 · JSON-RPC" />
          <Capability state={sidebandActive ? "active" : "off"} label="Diagnostics" detail={sidebandActive ? "extension active" : "not advertised"} />
          <Capability state={otelActive ? "active" : "off"} label="Traces" detail={otelActive ? "Phoenix · receiving" : "not connected"} />
        </div>
        <button className={styles.sessionAction} aria-label="Session actions"><MoreHorizontal size={17} /></button>
      </section>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeading}><span>Session</span><button aria-label="Create session" onClick={() => setSetupOpen(true)}><Plus size={14} /></button></div>
          <nav className={styles.navigation} aria-label="Session views">
            {viewLabels.map((item) => {
              const Icon = item.icon;
              const unavailable = item.id === "diagnostics" && scenario === "a2a";
              return (
                <button key={item.id} className={view === item.id ? styles.activeNav : ""} onClick={() => setView(item.id)}>
                  <Icon size={15} /><span>{item.label}</span>
                  {item.id === "artifacts" && <em>4</em>}
                  {item.id === "diagnostics" && <small>{unavailable ? "optional" : "3"}</small>}
                </button>
              );
            })}
          </nav>
          <div className={styles.sidebarSection}>
            <span>Capture</span>
            <div className={styles.captureCard}>
              <div><Radio size={14} /><strong>Recording</strong><i /></div>
              <small>9 protocol events · {otelActive ? "4 spans" : "no spans"}</small>
              <div className={styles.captureTime}><Clock3 size={12} /> 00:01:42</div>
            </div>
          </div>
          <div className={styles.sidebarSection}>
            <span>Try the experience</span>
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
                      <div className={styles.itineraryGrid}>
                        <article><span>01</span><div><strong>Nishiki & Pontocho</strong><small>Market breakfast · tea tasting · riverside dinner</small></div><em>Mon</em></article>
                        <article><span>02</span><div><strong>Arashiyama</strong><small>Tofu lunch · bamboo grove · kaiseki</small></div><em>Tue</em></article>
                        <article><span>03</span><div><strong>Fushimi & Gion</strong><small>Sake district · wagashi workshop · izakaya</small></div><em>Wed</em></article>
                        <article><span>04</span><div><strong>Higashiyama</strong><small>Coffee · soba lunch · afternoon open</small></div><em>Thu</em></article>
                      </div>
                      <button className={styles.artifactLink} onClick={() => setView("artifacts")}><FileText size={14} /><span><strong>Kyoto food itinerary</strong><small>4 parts · Markdown, JSON, image, PDF</small></span><Eye size={14} /></button>
                    </div>
                    {sidebandActive && <div className={styles.inlineEvidence}><SourceBadge source="sideband" /><span>3 diagnostic events</span><button onClick={() => setView("diagnostics")}>Inspect</button></div>}
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
                <article><span>Diagnostic events</span><strong>{sidebandActive ? "2" : "—"}</strong><em>{sidebandActive ? "optional extension" : "not provided"}</em></article>
                <article><span>Trace spans</span><strong>{otelActive ? "4" : "—"}</strong><em>{otelActive ? "exact correlation" : "not connected"}</em></article>
              </div>
              <div className={styles.timelineToolbar}><div><button className={sourceFilter === "all" ? styles.activeFilter : ""} onClick={() => setSourceFilter("all")}>All</button><button className={sourceFilter === "a2a" ? styles.activeFilter : ""} onClick={() => setSourceFilter("a2a")}>A2A</button><button className={sourceFilter === "sideband" ? styles.activeFilter : ""} onClick={() => setSourceFilter("sideband")} disabled={!sidebandActive}>Diagnostics</button><button className={sourceFilter === "otel" ? styles.activeFilter : ""} onClick={() => setSourceFilter("otel")} disabled={!otelActive}>Traces</button></div><button><Search size={14} /> Filter events</button></div>
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

          {view === "diagnostics" && (
            <div className={styles.diagnosticsView}>
              <header className={styles.viewHeader}>
                <div><span className={styles.viewIcon}><Gauge size={16} /></span><span><strong>Diagnostics</strong><small>Optional signals explained, never assumed</small></span></div>
                <button className={styles.secondaryButton} onClick={() => setSetupOpen(true)}><Settings2 size={14} /> Configure</button>
              </header>
              {scenario === "a2a" ? (
                <div className={styles.optionalEmpty}><span><Gauge size={24} /></span><h2>This agent did not advertise diagnostic events</h2><p>Nothing is broken. Conversation, tasks, streaming, and artifacts remain fully inspectable from standard A2A evidence.</p><button onClick={() => chooseScenario("diagnostics")}>Preview with diagnostics</button></div>
              ) : (
                <div className={styles.diagnosticsContent}>
                  <div className={styles.healthBanner}><Check size={16} /><span><strong>Healthy execution</strong><small>No protocol errors, retries, or policy blocks detected.</small></span><em>3 insights</em></div>
                  <div className={styles.diagnosticGrid}>
                    <article><header><Zap size={15} /><span><strong>Progress</strong><small>Sideband · advertised extension</small></span><em>complete</em></header><div className={styles.progressBar}><i /></div><p>4 of 4 itinerary days planned</p></article>
                    <article><header><Terminal size={15} /><span><strong>Tool activity</strong><small>Sideband · 1 invocation</small></span><em>318 ms</em></header><dl><div><dt>places.search</dt><dd>18 results</dd></div><div><dt>Status</dt><dd>completed</dd></div></dl></article>
                    <article><header><Database size={15} /><span><strong>AI usage</strong><small>{otelActive ? "OTEL · GenAI semantics" : "Telemetry unavailable"}</small></span><em>{otelActive ? "$0.0031" : "—"}</em></header>{otelActive ? <dl><div><dt>Input</dt><dd>1,260 tokens</dd></div><div><dt>Output</dt><dd>582 tokens</dd></div></dl> : <p>Point the agent&apos;s OTLP exporter at the Workbench receiver to see model usage.</p>}</article>
                    <article><header><Network size={15} /><span><strong>Correlation</strong><small>{otelActive ? "Exact · task attribute" : "A2A only"}</small></span><em className={otelActive ? styles.confident : ""}>{otelActive ? "100%" : "—"}</em></header><p>{otelActive ? <><code>a2a.task.id</code> matched 4 spans to this execution.</> : <>No trace was attached. Protocol events are still ordered by their A2A timestamps.</>}</p></article>
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
              <section className={styles.setupStep}><span className={styles.stepNumber}>2</span><div><div className={styles.stepTitle}><span><strong>Diagnostic events</strong><small>Optional · sent through an advertised A2A extension</small></span><span className={styles.optionalPill}>Optional</span></div><div className={styles.extensionRow}><span><Activity size={15} /><span><strong>Workbench diagnostics v1</strong><small>{sidebandActive ? "Advertised by this agent" : "Not advertised by this agent"}</small></span></span><button className={sidebandActive ? styles.toggleOn : styles.toggleOff} onClick={() => chooseScenario(sidebandActive ? "a2a" : "diagnostics")}><i /></button></div></div></section>
              <section className={styles.setupStep}><span className={styles.stepNumber}>3</span><div><div className={styles.stepTitle}><span><strong>Distributed traces</strong><small>Optional · point your existing OTEL exporter here</small></span><span className={styles.optionalPill}>Optional</span></div><div className={styles.phoenixCard}><div><span className={styles.phoenixLogo}><Sparkles size={15} /></span><span><strong>Embedded Phoenix</strong><small>{otelActive ? "Collector is running and receiving spans" : "Start a local collector for this session"}</small></span><button className={otelActive ? styles.stopButton : styles.startButton} onClick={() => chooseScenario(otelActive ? (sidebandActive ? "diagnostics" : "a2a") : "observed")}>{otelActive ? "Stop" : <><Play size={12} /> Start</>}</button></div>{otelActive && <div className={styles.endpointBox}><span><i /> OTLP/HTTP endpoint</span><code>http://127.0.0.1:6006/v1/traces</code><button onClick={copyEndpoint}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}</button></div>}</div><p className={styles.setupHint}>Your agent stays independent. Workbench only receives the telemetry it exports; Phoenix remains replaceable with another trace provider.</p></div></section>
            </div>
            <footer><span><Check size={14} /> Ready to capture standard A2A events</span><button className={styles.secondaryButton} onClick={() => setSetupOpen(false)}>Cancel</button><button className={styles.primaryButton} onClick={() => setSetupOpen(false)}>Start session</button></footer>
          </section>
        </div>
      )}
    </main>
  );
}
