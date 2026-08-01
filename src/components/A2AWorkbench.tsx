"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity, Braces, Bug, Check, ChevronRight, CircleAlert, CircleCheck, CircleX, Clipboard, Download,
  Clock3, FileJson, ListTodo, LoaderCircle, Menu, MessageSquareText, Moon, RadioTower,
  Paperclip, Play, PlugZap, Plus, RefreshCw, Send, Settings2, ShieldCheck, Square, Sun, TerminalSquare,
  Trash2, Unplug, X, Zap,
} from "lucide-react";
import { ArtifactGallery } from "./ArtifactGallery";
import { PartRenderer } from "./PartRenderer";
import { SidebandEventView, SidebandPanel } from "./SidebandPanel";
import { TelemetryPanel, TelemetrySpanView, telemetrySpanDuration } from "./TelemetryPanel";
import {
  assembleArtifacts, assembleConversationTurns, assembleTasks, extractMessages, normalizeParts,
  type ConversationTurn, type CorrelatedProtocolEvent,
} from "@/lib/content";
import {
  buildComposerParts, COMPOSER_FORMATS, composerFormatDefinition, mediaTypeIsAdvertised, type ComposerFormat,
} from "@/lib/message-parts";
import { readSse } from "@/lib/sse";
import {
  conversationalTaskId, extractProtocolTimestamp, extractTaskCorrelation, extractTaskStatusUpdates,
  type ProtocolStatusEvidence,
} from "@/lib/task-lifecycle";
import { buildExecutionTimeline } from "@/lib/execution-timeline";
import type {
  AuthConfig, ConnectionConfig, DiscoverResponse, OperationAction, OperationResponse, WireEvent,
} from "@/lib/workbench-types";
import type { RuntimePublicConfig, SidebandEvent, TelemetrySpan } from "@/shared/evidence/types";

const isPublicDemo = process.env.NEXT_PUBLIC_A2A_DEMO_MODE === "true";
const demoRawAttachmentLimit = 1024 * 1024;

type Tab = "overview" | "conversation" | "sideband" | "telemetry" | "operations" | "tasks" | "card";
type Status = "disconnected" | "connecting" | "connected" | "error";
type JsonObject = Record<string, unknown>;
interface ChatItem { id: string; role: "user" | "agent" | "status"; value: JsonObject; timestamp: string; requestId?: string }
interface Attachment { id: string; name: string; mediaType: string; raw: string; size: number }

const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const stateLabel = (state: unknown) => String(state ?? "TASK_STATE_UNSPECIFIED").replace("TASK_STATE_", "").replaceAll("_", " ").toLowerCase();

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { error?: { message?: string } }).error?.message ?? `HTTP ${response.status}`);
  return payload as T;
}

function makeLog(phase: WireEvent["phase"], body: unknown, method?: string): WireEvent {
  return { id: crypto.randomUUID(), timestamp: new Date().toISOString(), phase, body, method };
}

function AgentMessage({ item, allowRaw, richJson }: { item: ChatItem; allowRaw: boolean; richJson: boolean }) {
  const parts = normalizeParts(item.value.parts);
  return (
    <article className={`message-row ${item.role}`}>
      <div className="avatar">{item.role === "user" ? "Y" : item.role === "agent" ? "A" : <Activity size={14} />}</div>
      <div className="message-body">
        <header><strong>{item.role === "user" ? "You" : item.role === "agent" ? "Agent" : "Task update"}</strong><time>{new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></header>
        {parts.length ? <div className="message-parts">{parts.map((part, index) => <PartRenderer key={`${item.id}-${index}`} part={part} allowRaw={allowRaw} richJson={richJson} />)}</div> :
          allowRaw ? <pre className="code-block compact">{JSON.stringify(item.value, null, 2)}</pre> : <div className="unrendered-content">No renderable content parts</div>}
      </div>
    </article>
  );
}

function ArtifactResponse({ artifacts, taskId, timestamp, allowRaw, richJson }: { artifacts: ReturnType<typeof assembleArtifacts>; taskId?: string; timestamp: string; allowRaw: boolean; richJson: boolean }) {
  return <article className="message-row agent artifact-message">
    <div className="avatar">A</div>
    <div className="message-body">
      <header><strong>Agent</strong>{taskId && <span className="message-task-id" title={taskId}>Task {taskId.slice(0, 8)}</span>}<time>{new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></header>
      <ArtifactGallery artifacts={artifacts} allowRaw={allowRaw} richJson={richJson} />
    </div>
  </article>;
}

function StatusEvidenceView({ status, allowRaw, richJson }: { status: ProtocolStatusEvidence; allowRaw: boolean; richJson: boolean }) {
  const parts = normalizeParts(status.message?.parts);
  const label = stateLabel(status.state);
  const timestamp = status.timestamp ? new Date(status.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  const summary = <><span className="execution-source"><Activity size={13} />A2A</span><span className="execution-name"><strong>Task {label}</strong><small>{status.taskId ? status.taskId.slice(0, 12) : "status update"}</small></span><span className={`execution-status ${label}`}>{label}</span><time>{timestamp}</time></>;

  if (!parts.length) return <div className="execution-disclosure protocol"><div className="execution-static">{summary}<span /></div></div>;
  return <details className="execution-disclosure protocol">
    <summary>{summary}<ChevronRight className="disclosure-chevron" size={13} /></summary>
    <div className="execution-detail"><div className="message-parts">{parts.map((part, index) => <PartRenderer key={`${status.id}-${index}`} part={part} allowRaw={allowRaw} richJson={richJson} />)}</div></div>
  </details>;
}

function ExecutionActivity({ sidebandEvents, telemetrySpans, statusUpdates, allowRaw, richJson }: { sidebandEvents: SidebandEvent[]; telemetrySpans: TelemetrySpan[]; statusUpdates: ProtocolStatusEvidence[]; allowRaw: boolean; richJson: boolean }) {
  const evidence = buildExecutionTimeline(sidebandEvents, telemetrySpans, statusUpdates);
  if (!evidence.length) return null;
  const latestSideband = evidence.findLast((item) => item.kind === "sideband");
  const latest = latestSideband ?? evidence.at(-1);
  const latestLabel = latest?.kind === "sideband" ? latest.event.title : latest?.kind === "telemetry" ? latest.span.name : latest ? `Task ${stateLabel(latest.status.state)}` : undefined;

  return <details className="turn-execution">
    <summary><Activity size={13} /><strong>Execution activity</strong>{latestLabel && <small title={latestLabel}>{latestLabel}</small>}<span>{statusUpdates.length} updates · {sidebandEvents.length} sideband · {telemetrySpans.length} spans</span><ChevronRight className="disclosure-chevron" size={13} /></summary>
    <div className="turn-execution-list">{evidence.map((item) => item.kind === "sideband" ? <details className={`execution-disclosure sideband ${item.event.level}`} key={item.id}>
      <summary><span className="execution-source"><RadioTower size={13} />Sideband</span><span className="execution-name"><strong>{item.event.title}</strong><small>{item.event.type}</small></span><time>{new Date(item.event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><ChevronRight className="disclosure-chevron" size={13} /></summary>
      <div className="execution-detail"><SidebandEventView event={item.event} allowRaw={allowRaw} richJson={richJson} embedded /></div>
    </details> : item.kind === "telemetry" ? <details className="execution-disclosure telemetry" key={item.id}>
      <summary><span className="execution-source"><Activity size={13} />OTEL</span><span className="execution-name"><strong>{item.span.name}</strong><small>{item.span.kind} · {item.span.projectName}</small></span><span className={`execution-status ${item.span.statusCode.toLowerCase()}`}>{item.span.statusCode}</span>{telemetrySpanDuration(item.span) && <time>{telemetrySpanDuration(item.span)}</time>}<ChevronRight className="disclosure-chevron" size={13} /></summary>
      <div className="execution-detail"><TelemetrySpanView span={item.span} allowRaw={allowRaw} richJson={richJson} embedded /></div>
    </details> : <StatusEvidenceView key={item.id} status={item.status} allowRaw={allowRaw} richJson={richJson} />)}</div>
  </details>;
}

function ConversationTurnView({ turn, sidebandEvents, telemetrySpans, allowRaw, richJson }: { turn: ConversationTurn<ChatItem>; sidebandEvents: SidebandEvent[]; telemetrySpans: TelemetrySpan[]; allowRaw: boolean; richJson: boolean }) {
  const sidebandArtifactIds = new Set(sidebandEvents.flatMap((event) => event.references?.artifactId ? [event.references.artifactId] : []));
  const artifacts = assembleArtifacts(turn.events.map((event) => event.value), { excludeArtifactIds: sidebandArtifactIds });
  const artifactEvents = turn.events.filter((event) => assembleArtifacts([event.value], { excludeArtifactIds: sidebandArtifactIds }).length > 0);
  const artifactTimestamp = artifactEvents.at(-1)?.timestamp ?? turn.events.at(-1)?.timestamp ?? turn.timestamp;
  const correlation = turn.events.reduce((current, event) => ({ ...current, ...extractTaskCorrelation(event.value) }), {} as ReturnType<typeof extractTaskCorrelation>);
  const statusUpdates = [...new Map(turn.events.flatMap((event) => extractTaskStatusUpdates(event.value)).map((status) => [status.id, status])).values()];
  const userMessages = turn.messages.filter((message) => message.role === "user");
  const responseMessages = turn.messages.filter((message) => message.role !== "user");

  return <section className="conversation-turn" data-request-id={turn.requestId}>
    {userMessages.map((message) => <AgentMessage key={message.id} item={message} allowRaw={allowRaw} richJson={richJson} />)}
    <ExecutionActivity sidebandEvents={sidebandEvents} telemetrySpans={telemetrySpans} statusUpdates={statusUpdates} allowRaw={allowRaw} richJson={richJson} />
    {responseMessages.map((message) => <AgentMessage key={message.id} item={message} allowRaw={allowRaw} richJson={richJson} />)}
    {artifacts.length > 0 && <ArtifactResponse artifacts={artifacts} taskId={correlation.taskId} timestamp={artifactTimestamp} allowRaw={allowRaw} richJson={richJson} />}
  </section>;
}

function StatusBadge({ status }: { status: Status }) {
  const Icon = status === "connected" ? CircleCheck : status === "error" ? CircleX : status === "connecting" ? LoaderCircle : Unplug;
  return <span className={`status-badge ${status}`}><Icon size={14} />{status}</span>;
}

function ScoreRing({ score }: { score: number }) {
  return <div className="score-ring" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}><div><strong>{score}</strong><span>/100</span></div></div>;
}

export default function A2AWorkbench() {
  const [tab, setTab] = useState<Tab>("overview");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mobileNav, setMobileNav] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [status, setStatus] = useState<Status>("disconnected");
  const [error, setError] = useState("");
  const [cardUrl, setCardUrl] = useState(isPublicDemo ? "" : "http://localhost:3000/.well-known/agent-card.json");
  const [timeoutMs, setTimeoutMs] = useState(isPublicDemo ? 45_000 : 60_000);
  const [diagnosticMode, setDiagnosticMode] = useState(!isPublicDemo);
  const [authType, setAuthType] = useState<AuthConfig["type"]>("none");
  const [authPrimary, setAuthPrimary] = useState("");
  const [authSecondary, setAuthSecondary] = useState("");
  const [apiKeyName, setApiKeyName] = useState("X-API-Key");
  const [headersText, setHeadersText] = useState("{}");
  const [discovery, setDiscovery] = useState<DiscoverResponse>();
  const [interfaceIndex, setInterfaceIndex] = useState(0);
  const [logs, setLogs] = useState<WireEvent[]>([]);
  const [selectedLog, setSelectedLog] = useState<WireEvent>();
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimePublicConfig>();
  const [sessionId, setSessionId] = useState("");
  const [sidebandEvents, setSidebandEvents] = useState<SidebandEvent[]>([]);
  const [telemetrySpans, setTelemetrySpans] = useState<TelemetrySpan[]>([]);
  const [traceQueries, setTraceQueries] = useState<Array<{ traceId: string; requestId: string }>>([]);
  const [refreshingTraces, setRefreshingTraces] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [composerFormat, setComposerFormat] = useState<ComposerFormat>("plain");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [streaming, setStreaming] = useState(true);
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [events, setEvents] = useState<CorrelatedProtocolEvent[]>([]);
  const [taskId, setTaskId] = useState("");
  const [taskState, setTaskState] = useState<unknown>("");
  const [contextId, setContextId] = useState("");
  const [tenant, setTenant] = useState("");
  const [historyLength, setHistoryLength] = useState(20);
  const [operationResult, setOperationResult] = useState<unknown>();
  const [pushUrl, setPushUrl] = useState("");
  const [pushConfigId, setPushConfigId] = useState("");
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    if (window.matchMedia("(max-width: 840px)").matches) setInspectorOpen(false);
    setSessionId(crypto.randomUUID());
    fetch("/api/runtime", { cache: "no-store" }).then((response) => response.ok ? response.json() : undefined)
      .then((value) => { if (value) setRuntimeConfig(value as RuntimePublicConfig); }).catch(() => undefined);
  }, []);
  useEffect(() => { transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" }); }, [chat, events]);

  const auth = (): AuthConfig => {
    if (isPublicDemo) return { type: "none" };
    if (authType === "bearer") return { type: "bearer", token: authPrimary };
    if (authType === "basic") return { type: "basic", username: authPrimary, password: authSecondary };
    if (authType === "apiKey") return { type: "apiKey", name: apiKeyName, value: authPrimary };
    return { type: "none" };
  };

  const headers = () => {
    if (isPublicDemo) return {};
    let value: unknown;
    try { value = JSON.parse(headersText || "{}"); } catch { throw new Error("Custom headers must be valid JSON."); }
    if (!isObject(value) || Object.values(value).some((item) => typeof item !== "string")) throw new Error("Custom headers must be a JSON object with string values.");
    return value as Record<string, string>;
  };

  const interfaces = useMemo(() => {
    const value = discovery?.card.supportedInterfaces;
    return Array.isArray(value) ? value.filter(isObject) : [];
  }, [discovery]);

  const connection = (): ConnectionConfig => {
    const selected = interfaces[interfaceIndex];
    return {
      cardUrl, auth: auth(), headers: headers(), timeoutMs, diagnosticMode,
      interfaceUrl: typeof selected?.url === "string" ? selected.url : undefined,
      protocolBinding: typeof selected?.protocolBinding === "string" ? selected.protocolBinding : undefined,
      protocolVersion: typeof selected?.protocolVersion === "string" ? selected.protocolVersion : undefined,
    };
  };

  const appendTelemetry = (items: WireEvent[] = []) => setLogs((current) => [...current, ...items]);

  const connect = async (event?: FormEvent) => {
    event?.preventDefault(); setStatus("connecting"); setError("");
    try {
      const result = await postJson<DiscoverResponse>("/api/discover", { cardUrl, auth: auth(), headers: headers(), timeoutMs });
      const resolvedCardUrl = result.resolvedCardUrl ?? cardUrl;
      const discoveredCapabilities = isObject(result.card.capabilities) ? result.card.capabilities : {};
      setCardUrl(resolvedCardUrl); setDiscovery(result); setInterfaceIndex(0); setStreaming(discoveredCapabilities.streaming === true); appendTelemetry(result.telemetry); setStatus("connected");
      setLogs((current) => [...current, makeLog("response", { compliance: result.report, normalizedCard: result.card }, "Discover")]);
      localStorage.setItem("a2a:last-card-url", resolvedCardUrl);
    } catch (cause) { setStatus("error"); setError(errorMessage(cause)); }
  };

  const disconnect = () => {
    abortRef.current?.abort(); setStatus("disconnected"); setDiscovery(undefined); setChat([]); setEvents([]); setSidebandEvents([]); setTelemetrySpans([]); setTraceQueries([]); setTaskId(""); setTaskState(""); setContextId(""); setError("");
  };

  const startNewConversation = () => {
    abortRef.current?.abort(); abortRef.current = undefined;
    setChat([]); setEvents([]); setSidebandEvents([]); setTelemetrySpans([]); setTraceQueries([]); setSessionId(crypto.randomUUID()); setTaskId(""); setTaskState(""); setContextId(""); setPrompt(""); setAttachments([]);
    setOperationResult(undefined); setError(""); setBusy(false); setTab("conversation");
  };

  const captureIdentifiers = (value: unknown) => {
    const correlation = extractTaskCorrelation(value);
    if (correlation.contextId) setContextId(correlation.contextId);
    if (correlation.taskId) setTaskId(correlation.taskId);
    if (correlation.taskState !== undefined) setTaskState(correlation.taskState);
  };

  const captureEvent = (value: unknown, requestId: string) => {
    setEvents((current) => [...current, { requestId, value, timestamp: extractProtocolTimestamp(value) ?? new Date().toISOString() }]);
  };

  const addAgentMessages = (value: unknown, requestId?: string) => {
    // Task snapshots legitimately carry user messages in `history`. They are
    // protocol context, not new agent replies; the outgoing bubble is already
    // present locally, so replaying them here creates a misleading duplicate.
    const messages = extractMessages(value, { includeStatusMessages: false }).filter((message) => {
      const role = String(message.role ?? "").toUpperCase();
      return role !== "USER" && role !== "ROLE_USER" && role !== "1";
    });
    if (!messages.length) return;
    setChat((current) => {
      const ids = new Set(current.map((item) => item.id));
      const additions = messages.filter((message) => !ids.has(String(message.messageId))).map((message) => ({
        id: String(message.messageId ?? crypto.randomUUID()), role: "agent" as const, value: message, timestamp: new Date().toISOString(), requestId,
      }));
      return [...current, ...additions];
    });
  };

  const mergeTelemetrySpans = (incoming: TelemetrySpan[]) => setTelemetrySpans((current) => {
    const byId = new Map(current.map((span) => [`${span.projectId}:${span.spanId}`, span]));
    incoming.forEach((span) => byId.set(`${span.projectId}:${span.spanId}`, span));
    return [...byId.values()].sort((left, right) => String(left.startTime).localeCompare(String(right.startTime)));
  });

  const queryTrace = async (query: { traceId: string; requestId: string }, targetSessionId = sessionId) => {
    if (runtimeConfig?.telemetry.provider !== "phoenix" || !targetSessionId) return 0;
    const response = await fetch(`/api/telemetry/traces/${encodeURIComponent(query.traceId)}?sessionId=${encodeURIComponent(targetSessionId)}&requestId=${encodeURIComponent(query.requestId)}`, { cache: "no-store" });
    if (!response.ok) return 0;
    const payload = await response.json() as { spans?: TelemetrySpan[] };
    const spans = Array.isArray(payload.spans) ? payload.spans : [];
    mergeTelemetrySpans(spans);
    return spans.length;
  };

  const collectTrace = async (query: { traceId: string; requestId: string }, targetSessionId = sessionId) => {
    for (const delay of [0, 750, 1_500, 2_500]) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      await queryTrace(query, targetSessionId);
    }
  };

  const pollTraceWhileActive = async (query: { traceId: string; requestId: string }, targetSessionId: string, active: () => boolean) => {
    while (active()) {
      await queryTrace(query, targetSessionId);
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  };

  const refreshTraces = async () => {
    setRefreshingTraces(true);
    try { await Promise.all(traceQueries.map((query) => queryTrace(query))); }
    finally { setRefreshingTraces(false); }
  };

  const runOperation = async (action: OperationAction, params: Record<string, unknown> = {}, suppliedRequestId?: string) => {
    if (!discovery) return;
    setBusy(true); setError(""); setOperationResult(undefined);
    try {
      const requestId = suppliedRequestId ?? crypto.randomUUID();
      const response = await postJson<OperationResponse>("/api/operate", { connection: connection(), action, sessionId, requestId, params: { tenant, taskId, contextId, historyLength, ...params } });
      if (response.sessionId) setSessionId(response.sessionId);
      const correlatedRequestId = response.requestId ?? requestId;
      setOperationResult(response.result); captureEvent(response.result, correlatedRequestId); captureIdentifiers(response.result); addAgentMessages(response.result, correlatedRequestId); appendTelemetry(response.telemetry);
      if (response.sidebandEvents?.length) setSidebandEvents((current) => [...current, ...response.sidebandEvents!]);
      if (response.traceId && response.requestId) {
        const query = { traceId: response.traceId, requestId: response.requestId };
        setTraceQueries((current) => current.some((item) => item.traceId === query.traceId) ? current : [...current, query]);
        void collectTrace(query, response.sessionId ?? sessionId);
      }
      if (response.diagnostics?.length) setLogs((current) => [...current, makeLog("error", { diagnostics: response.diagnostics }, "Diagnostic recovery")]);
      setLogs((current) => [...current, makeLog("response", response.result, `${action} · ${response.transport} · v${response.protocolVersion}`)]);
      return response.result;
    } catch (cause) { setError(errorMessage(cause)); setLogs((current) => [...current, makeLog("error", { message: errorMessage(cause) }, action)]); }
    finally { setBusy(false); }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!discovery || (!prompt.trim() && !attachments.length)) return;
    let parts: ReturnType<typeof buildComposerParts>;
    try { parts = buildComposerParts(prompt, composerFormat, attachments); }
    catch (cause) { setError(errorMessage(cause)); return; }
    const userMessage: JsonObject = { messageId: crypto.randomUUID(), role: "ROLE_USER", parts };
    const requestId = crypto.randomUUID();
    setChat((current) => [...current, { id: String(userMessage.messageId), role: "user", value: userMessage, timestamp: new Date().toISOString(), requestId }]);
    setPrompt(""); setAttachments([]); setBusy(true); setError("");
    const params = {
      parts,
      contextId,
      taskId: conversationalTaskId(taskId, taskState),
      tenant,
      historyLength,
    };
    if (!streaming) { await runOperation("send", params, requestId); return; }
    const controller = new AbortController(); abortRef.current = controller;
    let streamTraceId = "";
    let streamSessionId = sessionId;
    let streamActive = true;
    let tracePollingStarted = false;
    try {
      const response = await fetch("/api/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connection: connection(), action: "send", sessionId, requestId, params }), signal: controller.signal });
      for await (const frame of readSse(response, controller.signal)) {
        if (frame.event === "meta" && isObject(frame.data)) {
          const telemetry = Array.isArray(frame.data.telemetry) ? frame.data.telemetry as WireEvent[] : [];
          if (typeof frame.data.sessionId === "string") { streamSessionId = frame.data.sessionId; setSessionId(frame.data.sessionId); }
          if (typeof frame.data.traceId === "string") {
            streamTraceId = frame.data.traceId;
            const query = { traceId: streamTraceId, requestId };
            setTraceQueries((current) => current.some((item) => item.traceId === streamTraceId) ? current : [...current, query]);
            if (!tracePollingStarted) {
              tracePollingStarted = true;
              void pollTraceWhileActive(query, streamSessionId, () => streamActive && !controller.signal.aborted);
            }
          }
          appendTelemetry(telemetry);
        } else if (frame.event === "a2a") {
          captureEvent(frame.data, requestId); captureIdentifiers(frame.data); addAgentMessages(frame.data, requestId);
          setLogs((current) => [...current, makeLog("stream", frame.data, "A2A stream event")]);
        } else if (frame.event === "sideband" && isObject(frame.data)) {
          setSidebandEvents((current) => [...current, frame.data as unknown as SidebandEvent]);
        } else if (frame.event === "diagnostic") {
          setLogs((current) => [...current, makeLog("error", frame.data, "Diagnostic recovery")]);
        } else if (frame.event === "end") {
          streamActive = false;
          if (streamTraceId) void collectTrace({ traceId: streamTraceId, requestId }, streamSessionId);
        } else if (frame.event === "error") throw new Error(isObject(frame.data) ? String(frame.data.message) : "Stream failed");
      }
    } catch (cause) {
      if ((cause as Error)?.name !== "AbortError") { setError(errorMessage(cause)); setLogs((current) => [...current, makeLog("error", { message: errorMessage(cause) }, "SendStreamingMessage")]); }
    } finally { streamActive = false; setBusy(false); abortRef.current = undefined; }
  };

  const resubscribe = async () => {
    if (!taskId) return setError("Enter or capture a task ID first.");
    setBusy(true); const controller = new AbortController(); abortRef.current = controller;
    let streamTraceId = "";
    let streamSessionId = sessionId;
    let streamActive = true;
    let tracePollingStarted = false;
    try {
      const requestId = crypto.randomUUID();
      const response = await fetch("/api/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connection: connection(), action: "resubscribe", sessionId, requestId, params: { taskId, tenant } }), signal: controller.signal });
      for await (const frame of readSse(response, controller.signal)) {
        if (frame.event === "meta" && isObject(frame.data)) {
          const telemetry = Array.isArray(frame.data.telemetry) ? frame.data.telemetry as WireEvent[] : [];
          if (typeof frame.data.sessionId === "string") { streamSessionId = frame.data.sessionId; setSessionId(frame.data.sessionId); }
          if (typeof frame.data.traceId === "string") {
            streamTraceId = frame.data.traceId;
            const query = { traceId: streamTraceId, requestId };
            setTraceQueries((current) => current.some((item) => item.traceId === streamTraceId) ? current : [...current, query]);
            if (!tracePollingStarted) {
              tracePollingStarted = true;
              void pollTraceWhileActive(query, streamSessionId, () => streamActive && !controller.signal.aborted);
            }
          }
          appendTelemetry(telemetry);
        } else if (frame.event === "a2a") {
          captureEvent(frame.data, requestId); captureIdentifiers(frame.data); addAgentMessages(frame.data, requestId); setLogs((current) => [...current, makeLog("stream", frame.data, "SubscribeToTask")]);
        } else if (frame.event === "sideband" && isObject(frame.data)) {
          setSidebandEvents((current) => [...current, frame.data as unknown as SidebandEvent]);
        } else if (frame.event === "end" && streamTraceId) {
          streamActive = false;
          void collectTrace({ traceId: streamTraceId, requestId }, streamSessionId);
        }
      }
    } catch (cause) { if ((cause as Error)?.name !== "AbortError") setError(errorMessage(cause)); }
    finally { streamActive = false; setBusy(false); abortRef.current = undefined; }
  };

  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = [...(event.target.files ?? [])];
    try {
      const loaded = await Promise.all(selected.map((file) => new Promise<Attachment>((resolve, reject) => {
        const perFileLimit = isPublicDemo ? demoRawAttachmentLimit : 10 * 1024 * 1024;
        if (file.size > perFileLimit) return reject(new Error(`${file.name} exceeds ${isPublicDemo ? "1 MB in the public demo" : "10 MB"}.`));
        const reader = new FileReader();
        reader.onload = () => resolve({ id: crypto.randomUUID(), name: file.name, mediaType: file.type || "application/octet-stream", raw: String(reader.result).split(",")[1] ?? "", size: file.size });
        reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
      })));
      if (isPublicDemo && attachments.reduce((sum, file) => sum + file.size, 0) + loaded.reduce((sum, file) => sum + file.size, 0) > demoRawAttachmentLimit) {
        throw new Error("The public demo accepts up to 1 MB of attached files per request.");
      }
      setAttachments((current) => [...current, ...loaded]); setError("");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { event.target.value = ""; }
  };

  const conversationTurns = useMemo(() => assembleConversationTurns(chat, events), [chat, events]);
  const telemetryByRequest = useMemo(() => {
    const requestByTrace = new Map(traceQueries.map((query) => [query.traceId, query.requestId]));
    const grouped = new Map<string, TelemetrySpan[]>();
    for (const span of telemetrySpans) {
      const requestId = requestByTrace.get(span.traceId);
      if (!requestId) continue;
      grouped.set(requestId, [...(grouped.get(requestId) ?? []), span]);
    }
    return grouped;
  }, [telemetrySpans, traceQueries]);
  const tasks = useMemo(() => assembleTasks(events.map((event) => event.value)), [events]);
  const card = discovery?.card;
  const capabilities = isObject(card?.capabilities) ? card.capabilities : {};
  const skills = Array.isArray(card?.skills) ? card.skills.filter(isObject) : [];
  const selectedInterface = interfaces[interfaceIndex];
  const selectedComposerFormat = composerFormatDefinition(composerFormat);
  const advertisedInputModes = [...new Set([
    ...(Array.isArray(card?.defaultInputModes) ? card.defaultInputModes : []),
    ...skills.flatMap((skill) => Array.isArray(skill.inputModes) ? skill.inputModes : []),
  ].filter((mode): mode is string => typeof mode === "string"))];
  const editorModeAdvertised = advertisedInputModes.length
    ? mediaTypeIsAdvertised(selectedComposerFormat.mediaType, advertisedInputModes)
    : undefined;

  const exportSession = () => {
    if (!sessionId) return;
    const anchor = document.createElement("a");
    anchor.href = `/api/sessions/${encodeURIComponent(sessionId)}/export`;
    anchor.download = `a2a-session-${sessionId}.zip`;
    anchor.click();
  };

  const allowRaw = runtimeConfig?.features.rawEvidenceViews === true;
  const richJson = runtimeConfig?.features.richJsonViews === true;

  return (
    <main className="workbench-shell">
      <header className="topbar">
        <button className="icon-button mobile-only" onClick={() => setMobileNav(true)} aria-label="Open connection panel"><Menu size={19} /></button>
        <div className="brand"><div className="brand-mark"><img src="/icon.svg" width="32" height="32" alt="Logo" /></div><div><strong>SpanPlane</strong><span>Console</span></div></div>
        <div className="topbar-center"><StatusBadge status={status} />{selectedInterface && <><span className="top-chip">{String(selectedInterface.protocolBinding)}</span><span className="top-chip">v{String(selectedInterface.protocolVersion)}</span></>}{discovery?.sideband?.negotiatedUris.length ? <span className="top-chip evidence"><RadioTower size={12} />Sideband</span> : null}{runtimeConfig?.telemetry.provider === "phoenix" && <span className="top-chip evidence">OTEL</span>}</div>
        <div className="top-actions">{isPublicDemo && <Link className="top-about" href="/">About</Link>}<button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Toggle theme">{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</button><button className={`icon-button ${inspectorOpen ? "active" : ""}`} onClick={() => setInspectorOpen(!inspectorOpen)} aria-label="Toggle event inspector"><TerminalSquare size={18} /><span className="log-count">{logs.length}</span></button></div>
      </header>

      <div className="workbench-grid">
        <aside className={`connection-panel ${mobileNav ? "mobile-open" : ""}`}>
          <div className="panel-title"><div><PlugZap size={17} /><strong>Connection</strong></div><button className="icon-button mobile-only" onClick={() => setMobileNav(false)} aria-label="Close connection panel"><X size={18} /></button></div>
          <form onSubmit={connect} className="connection-form">
            <label>Agent base or Card URL<input value={cardUrl} onChange={(e) => setCardUrl(e.target.value)} placeholder="https://agent.example" spellCheck={false} disabled={status === "connected" || status === "connecting"} /></label>
            {isPublicDemo ? <div className="demo-callout"><ShieldCheck size={15} /><span>Public-demo safety: HTTPS public agents only; no credentials, custom headers, gRPC, or push webhooks. Use a local install for those tests.</span></div> : <details className="advanced"><summary><Settings2 size={15} /> Authentication & request</summary><div className="advanced-body">
              <label>Authentication<select value={authType} onChange={(e) => { setAuthType(e.target.value as AuthConfig["type"]); setAuthPrimary(""); setAuthSecondary(""); }}><option value="none">None</option><option value="bearer">Bearer token</option><option value="apiKey">API key</option><option value="basic">Basic auth</option></select></label>
              {authType === "apiKey" && <label>Header name<input value={apiKeyName} onChange={(e) => setApiKeyName(e.target.value)} /></label>}
              {authType !== "none" && <label>{authType === "basic" ? "Username" : authType === "bearer" ? "Token" : "API key"}<input type={authType === "basic" ? "text" : "password"} value={authPrimary} onChange={(e) => setAuthPrimary(e.target.value)} autoComplete="off" /></label>}
              {authType === "basic" && <label>Password<input type="password" value={authSecondary} onChange={(e) => setAuthSecondary(e.target.value)} autoComplete="off" /></label>}
              <label>Custom headers (JSON)<textarea rows={3} value={headersText} onChange={(e) => setHeadersText(e.target.value)} spellCheck={false} /></label>
              <label>Timeout <span>{Math.round(timeoutMs / 1000)}s</span><input type="range" min="5000" max="180000" step="5000" value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value))} /></label>
              <label className="switch-label diagnostic-switch"><input type="checkbox" checked={diagnosticMode} onChange={(e) => setDiagnosticMode(e.target.checked)} /><span />Recover malformed legacy responses <small>Strict SDK validation still runs first.</small></label>
            </div></details>}
            {status === "connected" ? <div style={{ display: "flex", gap: "8px" }}><button type="button" className="button secondary" onClick={disconnect} title="Disconnect and clear state"><Unplug size={16} /></button><button type="button" className="button primary wide" onClick={(e) => connect(e as unknown as React.FormEvent)}><RefreshCw size={16} />Reconnect</button></div> : <button className="button primary wide" disabled={status === "connecting"}>{status === "connecting" ? <LoaderCircle className="spin" size={16} /> : <PlugZap size={16} />}Connect & inspect</button>}
          </form>
          {interfaces.length > 0 && <section className="interface-list"><div className="eyebrow">Advertised interfaces</div>{interfaces.map((item, index) => <button key={`${item.url}-${index}`} className={`interface-card ${index === interfaceIndex ? "active" : ""}`} onClick={() => setInterfaceIndex(index)}><span className="radio-dot">{index === interfaceIndex && <Check size={11} />}</span><span><strong>{String(item.protocolBinding)}</strong><small>{String(item.protocolVersion)} · {String(item.tenant || "default tenant")}</small><code>{String(item.url)}</code></span></button>)}</section>}
          <div className="connection-foot"><ShieldCheck size={15} /><span>{isPublicDemo ? "Demo requests are transient and restricted to public HTTPS agents. Nothing is stored as a Workbench session." : "Credentials stay server-side and are redacted from logs. Localhost and private development agents are allowed by default."}</span></div>
        </aside>

        <section className="main-panel">
          <nav className="tabs" aria-label="Workbench sections">{([ ["overview", Activity, "Overview"], ["conversation", MessageSquareText, "Conversation"], ["sideband", RadioTower, "Sideband"], ["telemetry", Activity, "Telemetry"], ["operations", Play, "Operations"], ["tasks", ListTodo, "Tasks"], ["card", FileJson, "Card & compliance"] ] as const).map(([id, Icon, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={16} />{label}{id === "sideband" && sidebandEvents.length > 0 && <span className="tab-count">{sidebandEvents.length}</span>}{id === "telemetry" && telemetrySpans.length > 0 && <span className="tab-count">{telemetrySpans.length}</span>}</button>)}</nav>
          {error && <div className="error-banner"><CircleAlert size={17} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
          <div className="workspace-content">
            {!discovery ? <EmptyState onConnect={() => { document.querySelector<HTMLInputElement>('.connection-form input')?.focus(); setMobileNav(true); }} /> :
            tab === "overview" ? <Overview discovery={discovery} capabilities={capabilities} skills={skills} selectedInterface={selectedInterface} runtimeConfig={runtimeConfig} onNavigate={setTab} /> :
            tab === "conversation" ? <section className="conversation-layout">
              <header className="conversation-header">
                <div><MessageSquareText size={17} /><div><strong>Conversation</strong><span>{contextId ? `Context ${contextId}` : "No active context"}</span></div></div>
                <button type="button" className="button secondary" onClick={startNewConversation}><Plus size={15} />New conversation</button>
              </header>
              <div className="transcript" ref={transcriptRef}>{conversationTurns.length === 0 ? <div className="conversation-empty"><MessageSquareText size={28} /><strong>Start a protocol conversation</strong><p>Messages, task transitions, sideband context, and content-aware artifacts will appear here.</p></div> : conversationTurns.map((turn) => <ConversationTurnView key={turn.requestId} turn={turn} sidebandEvents={sidebandEvents.filter((event) => event.requestId === turn.requestId)} telemetrySpans={telemetryByRequest.get(turn.requestId) ?? []} allowRaw={allowRaw} richJson={richJson} />)}</div>
              <form className="composer" onSubmit={sendMessage}>
                <div className="composer-format-row">
                  <div className="format-options" role="radiogroup" aria-label="Message content format">{COMPOSER_FORMATS.map((format) => <button key={format.id} type="button" role="radio" aria-checked={composerFormat === format.id} className={composerFormat === format.id ? "active" : ""} onClick={() => { setComposerFormat(format.id); setError(""); }}>{format.label}</button>)}</div>
                  <span className="part-contract"><strong>{selectedComposerFormat.partKind}</strong><code>{selectedComposerFormat.mediaType}</code>{editorModeAdvertised !== undefined && <span className={editorModeAdvertised ? "advertised" : "not-advertised"} title={editorModeAdvertised ? "This media type is advertised in the Agent Card" : `The Agent Card advertises: ${advertisedInputModes.join(", ")}`}><span />{editorModeAdvertised ? "advertised" : "not advertised"}</span>}</span>
                </div>
                {attachments.length > 0 && <div className="attachment-section"><div className="attachment-heading"><span>File parts</span><small>sent inline as raw base64</small></div><div className="attachment-row">{attachments.map((file) => { const advertised = !advertisedInputModes.length || mediaTypeIsAdvertised(file.mediaType, advertisedInputModes); return <span key={file.id} className={advertised ? undefined : "mode-warning"} title={advertised ? `${file.mediaType} is advertised or no input modes were declared` : `${file.mediaType} is not advertised by this agent`}><Paperclip size={13} /><span><strong>{file.name}</strong><small><b>raw</b> · {file.mediaType} · {Math.ceil(file.size / 1024)} KB{!advertised && " · not advertised"}</small></span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))}><X size={12} /></button></span>; })}</div></div>}
                <textarea value={prompt} onChange={(e) => { setPrompt(e.target.value); if (error.startsWith("JSON message is invalid")) setError(""); }} placeholder={selectedComposerFormat.placeholder} aria-label={`${selectedComposerFormat.label} message`} spellCheck={composerFormat === "plain"} rows={composerFormat === "json" ? 5 : 3} className={composerFormat === "json" ? "code-editor" : undefined} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && composerFormat !== "json") { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
                <div className="composer-actions"><div><label className="attach-button" title="Files are sent as A2A raw byte parts"><Paperclip size={16} /><span>Attach files</span><input type="file" multiple onChange={onFiles} /></label><span className="part-summary">{prompt.trim() ? `1 ${selectedComposerFormat.partKind}` : "0 editor"} · {attachments.length} raw</span><label className="switch-label" title={capabilities.streaming === true ? "Use streaming SendMessage" : "This Agent Card does not advertise streaming"}><input type="checkbox" checked={streaming} disabled={capabilities.streaming !== true} onChange={(e) => setStreaming(e.target.checked)} /><span />Stream</label></div>{busy ? <button type="button" className="button danger" onClick={() => abortRef.current?.abort()}><Square size={14} />Stop</button> : <button className="button primary" disabled={!prompt.trim() && !attachments.length}><Send size={15} />Send</button>}</div>
              </form>
            </section> :
            tab === "sideband" ? <SidebandPanel events={sidebandEvents} allowRaw={allowRaw} richJson={richJson} /> :
            tab === "telemetry" ? <TelemetryPanel config={runtimeConfig} spans={telemetrySpans} allowRaw={allowRaw} richJson={richJson} refreshing={refreshingTraces} onRefresh={refreshTraces} /> :
            tab === "operations" ? <Operations publicDemo={isPublicDemo} capabilities={capabilities} taskId={taskId} setTaskId={setTaskId} contextId={contextId} setContextId={setContextId} tenant={tenant} setTenant={setTenant} historyLength={historyLength} setHistoryLength={setHistoryLength} busy={busy} run={runOperation} resubscribe={resubscribe} result={operationResult} pushUrl={pushUrl} setPushUrl={setPushUrl} pushConfigId={pushConfigId} setPushConfigId={setPushConfigId} /> :
            tab === "tasks" ? <Tasks tasks={tasks} onInspect={(id) => { setTaskId(id); setTab("operations"); }} /> :
            <CardCompliance discovery={discovery} copied={copied} onCopy={() => { navigator.clipboard.writeText(JSON.stringify(discovery.rawCard, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1400); }} />}
          </div>
        </section>

        {inspectorOpen && <aside className="inspector-panel"><header><div><Bug size={17} /><strong>Event inspector</strong><span>{logs.length}</span></div><div><button className="text-button" onClick={exportSession} disabled={!sessionId}><Download size={13} />Export</button><button className="icon-button" onClick={() => { setLogs([]); setSelectedLog(undefined); }} aria-label="Clear logs"><Trash2 size={15} /></button><button className="icon-button desktop-hide-inspector" onClick={() => setInspectorOpen(false)} aria-label="Close event inspector"><X size={16} /></button></div></header><div className="inspector-body"><div className="event-list">{logs.length === 0 ? <div className="logs-empty"><TerminalSquare size={25} /><span>No wire events yet</span></div> : logs.map((log) => <button key={log.id} className={selectedLog?.id === log.id ? "active" : ""} onClick={() => setSelectedLog(log)}><span className={`event-dot ${log.phase}`} /><span><strong>{log.method || log.phase}</strong><small>{new Date(log.timestamp).toLocaleTimeString()} {log.status ? `· ${log.status}` : ""} {log.durationMs ? `· ${log.durationMs}ms` : ""}</small></span><ChevronRight size={14} /></button>)}</div>{selectedLog && <div className="event-detail"><div className="detail-meta"><span>{selectedLog.phase}</span>{selectedLog.url && <code>{selectedLog.url}</code>}</div>{allowRaw ? <pre>{JSON.stringify(selectedLog, null, 2)}</pre> : <div className="raw-disabled"><Braces size={20} /><strong>Raw views are disabled</strong><span>Set A2A_ENABLE_RAW_VIEWS=true before starting the application.</span></div>}</div>}</div></aside>}
      </div>
    </main>
  );
}

function EmptyState({ onConnect }: { onConnect: () => void }) {
  return <div className="empty-state"><img src="/icon.svg" width="96" height="96" alt="SpanPlane Logo" style={{ marginBottom: '32px' }} /><h1>Test any A2A agent,<br />from discovery to artifacts.</h1><p>A version-aware workbench for A2A v1.0 and v0.3 across JSON-RPC, HTTP+JSON, and gRPC.</p><button className="button primary" onClick={onConnect}><PlugZap size={16} />Connect an agent</button><div className="feature-strip"><span><CircleCheck size={15} />Protocol validation</span><span><Activity size={15} />Live task streams</span><span><Braces size={15} />Generative content views</span></div></div>;
}

function Overview({ discovery, capabilities, skills, selectedInterface, runtimeConfig, onNavigate }: { discovery: DiscoverResponse; capabilities: JsonObject; skills: JsonObject[]; selectedInterface?: JsonObject; runtimeConfig?: RuntimePublicConfig; onNavigate: (tab: Tab) => void }) {
  const card = discovery.card;
  const negotiatedSideband = discovery.sideband?.negotiatedUris ?? [];
  return <div className="overview-page"><section className="agent-hero"><div className="agent-icon">{String(card.name ?? "A").slice(0, 2).toUpperCase()}</div><div><div className="eyebrow">Connected agent</div><h1>{String(card.name ?? "Unnamed agent")}</h1><p>{String(card.description ?? "No description supplied.")}</p><div className="chip-row"><span>Agent v{String(card.version ?? "—")}</span>{selectedInterface && <span>{String(selectedInterface.protocolBinding)} · A2A {String(selectedInterface.protocolVersion)}</span>}{Object.entries(capabilities).filter(([, value]) => value === true).map(([key]) => <span key={key}>{key}</span>)}</div></div></section><section className="evidence-sources"><header><div><RadioTower size={17} /><div><strong>Evidence sources</strong><p>Each source remains identifiable and is correlated in the session export.</p></div></div></header><div><article><span className="source-state active" /><div><strong>A2A protocol</strong><p>Messages, tasks, status updates, artifacts, and transport events</p></div><b>Core</b></article><article><span className={`source-state ${negotiatedSideband.length ? "active" : ""}`} /><div><strong>Sideband extension</strong><p>{negotiatedSideband.length ? negotiatedSideband.join(", ") : "Not advertised with a URI understood by this client"}</p></div><b>{negotiatedSideband.length ? "Negotiated" : "Optional"}</b></article><article><span className={`source-state ${runtimeConfig?.telemetry.provider === "phoenix" ? "active" : ""}`} /><div><strong>OpenTelemetry</strong><p>{runtimeConfig?.telemetry.otlpHttpEndpoint ?? "Start with managed Phoenix or configure an external provider"}</p></div><b>{runtimeConfig?.telemetry.provider === "phoenix" ? runtimeConfig.telemetry.status : "Optional"}</b></article></div></section><div className="overview-grid"><section className="overview-card compliance-summary"><header><div><ShieldCheck size={18} /><strong>Protocol readiness</strong></div><button className="text-button" onClick={() => onNavigate("card")}>View report</button></header><div className="score-layout"><ScoreRing score={discovery.report.score} /><div><strong>{discovery.report.counts.error === 0 ? "Ready to test" : "Card needs attention"}</strong><p>Detected A2A {discovery.report.version}</p><div className="issue-counts"><span className="error">{discovery.report.counts.error} errors</span><span className="warning">{discovery.report.counts.warning} warnings</span><span>{discovery.report.counts.info} notes</span></div></div></div></section><section className="overview-card"><header><div><Activity size={18} /><strong>Connection</strong></div><span className="latency"><Clock3 size={14} />{discovery.latencyMs} ms</span></header><dl className="fact-list"><div><dt>Binding</dt><dd>{String(selectedInterface?.protocolBinding ?? "—")}</dd></div><div><dt>Protocol</dt><dd>A2A {String(selectedInterface?.protocolVersion ?? discovery.report.version)}</dd></div><div><dt>Tenant</dt><dd>{String(selectedInterface?.tenant || "Default")}</dd></div><div><dt>Endpoint</dt><dd><code>{String(selectedInterface?.url ?? "—")}</code></dd></div></dl></section></div><section className="skills-section"><header><div><Zap size={18} /><div><strong>Agent skills</strong><p>Declared capabilities and interaction modes</p></div></div><span>{skills.length}</span></header><div className="skills-grid">{skills.map((skill, index) => <article key={String(skill.id ?? index)}><div className="skill-number">{String(index + 1).padStart(2, "0")}</div><h3>{String(skill.name ?? skill.id ?? "Unnamed skill")}</h3><p>{String(skill.description ?? "No description")}</p><div className="tag-row">{(Array.isArray(skill.tags) ? skill.tags : []).map((tag) => <span key={String(tag)}>{String(tag)}</span>)}</div></article>)}</div></section></div>;
}

interface OperationsProps { publicDemo: boolean; capabilities: JsonObject; taskId: string; setTaskId: (v: string) => void; contextId: string; setContextId: (v: string) => void; tenant: string; setTenant: (v: string) => void; historyLength: number; setHistoryLength: (v: number) => void; busy: boolean; run: (action: OperationAction, params?: Record<string, unknown>) => Promise<unknown>; resubscribe: () => void; result: unknown; pushUrl: string; setPushUrl: (v: string) => void; pushConfigId: string; setPushConfigId: (v: string) => void }
function Operations(props: OperationsProps) {
  const canStream = props.capabilities.streaming === true;
  const canPush = !props.publicDemo && props.capabilities.pushNotifications === true;
  const canExtendedCard = props.capabilities.extendedAgentCard === true;
  return <div className="operations-page">
    <div className="section-heading"><div><h1>Protocol operations</h1><p>Call individual A2A methods directly against the selected version and transport.</p></div>{props.busy && <span className="working-pill"><LoaderCircle className="spin" size={14} />Running</span>}</div>
    <section className="operation-notice"><TerminalSquare size={19} /><div><strong>What is this for?</strong><p>Conversation tests the normal user flow. Operations is the protocol console: inspect stored tasks, resume streams, test cancellation, fetch an extended card, and manage push webhooks. Task and context IDs are captured automatically after a conversation send, or you can paste IDs from another client.</p></div></section>
    <section className="operation-card"><header><ListTodo size={18} /><div><strong>Task lifecycle</strong><p>Inspect, enumerate, resume, or cancel server-side tasks.</p></div></header><div className="field-grid"><label>Task ID<input value={props.taskId} onChange={(e) => props.setTaskId(e.target.value)} placeholder="Captured automatically after send" /></label><label>Context ID<input value={props.contextId} onChange={(e) => props.setContextId(e.target.value)} placeholder="Optional ListTasks filter" /></label><label>Tenant<input value={props.tenant} onChange={(e) => props.setTenant(e.target.value)} placeholder="Optional" /></label><label>History length<input type="number" min="0" max="100" value={props.historyLength} onChange={(e) => props.setHistoryLength(Number(e.target.value))} /></label></div><div className="button-row"><button className="button secondary" title="Fetch the current task snapshot" disabled={!props.taskId || props.busy} onClick={() => props.run("getTask")}><RefreshCw size={15} />GetTask</button><button className="button secondary" title="List tasks, optionally filtered by context" disabled={props.busy} onClick={() => props.run("listTasks")}><ListTodo size={15} />ListTasks</button><button className="button secondary" title={canStream ? "Resume the event stream for this task" : "Streaming is not advertised by this agent"} disabled={!canStream || !props.taskId || props.busy} onClick={props.resubscribe}><Activity size={15} />SubscribeToTask</button><button className="button danger-quiet" title="Request cancellation; the task state determines whether it can be canceled" disabled={!props.taskId || props.busy} onClick={() => props.run("cancelTask")}><Square size={14} />CancelTask</button></div></section>
    <section className="operation-card"><header><ShieldCheck size={18} /><div><strong>Agent and push configuration</strong><p>Test optional authenticated-card and webhook APIs advertised by the agent.</p></div></header><div className="button-row"><button className="button secondary" title={canExtendedCard ? "Fetch the authenticated extended Agent Card" : "Extended Agent Card is not advertised"} disabled={!canExtendedCard || props.busy} onClick={() => props.run("extendedCard")}><FileJson size={15} />GetExtendedAgentCard</button>{!canExtendedCard && <span className="capability-note">Not advertised</span>}</div>{props.publicDemo ? <p className="capability-note">Push webhook operations are available only in local Workbench because they ask an agent to call a third-party URL.</p> : <><div className="divider" /><div className="field-grid"><label>Webhook URL<input disabled={!canPush} value={props.pushUrl} onChange={(e) => props.setPushUrl(e.target.value)} placeholder={canPush ? "https://receiver.example/a2a/events" : "Push notifications are not advertised"} /></label><label>Config ID<input disabled={!canPush} value={props.pushConfigId} onChange={(e) => props.setPushConfigId(e.target.value)} placeholder="Server-generated or existing" /></label></div><div className="button-row"><button className="button secondary" disabled={!canPush || !props.taskId || !props.pushUrl || props.busy} onClick={() => props.run("createPushConfig", { url: props.pushUrl, configId: props.pushConfigId })}>Create config</button><button className="button secondary" disabled={!canPush || !props.taskId || !props.pushConfigId || props.busy} onClick={() => props.run("getPushConfig", { configId: props.pushConfigId })}>Get config</button><button className="button secondary" disabled={!canPush || !props.taskId || props.busy} onClick={() => props.run("listPushConfigs")}>List configs</button><button className="button danger-quiet" disabled={!canPush || !props.taskId || !props.pushConfigId || props.busy} onClick={() => props.run("deletePushConfig", { configId: props.pushConfigId })}>Delete config</button>{!canPush && <span className="capability-note">Push notifications are not advertised by this Agent Card.</span>}</div></>}</section>{props.result !== undefined && <section className="result-panel"><header><strong>Latest normalized response</strong></header><pre>{JSON.stringify(props.result, null, 2)}</pre></section>}
  </div>;
}

function Tasks({ tasks, onInspect }: { tasks: JsonObject[]; onInspect: (id: string) => void }) {
  return <div className="tasks-page"><div className="section-heading"><div><h1>Observed tasks</h1><p>Tasks captured during this in-browser testing session.</p></div><span className="count-pill">{tasks.length}</span></div>{tasks.length === 0 ? <div className="empty-card"><ListTodo size={26} /><strong>No tasks observed</strong><p>Send a message that creates a task, or list tasks from Operations.</p></div> : <div className="task-list">{tasks.map((task) => { const status = isObject(task.status) ? task.status : {}; return <article key={String(task.id)}><div className={`task-state ${stateLabel(status.state).replaceAll(" ", "-")}`}><span />{stateLabel(status.state)}</div><div><strong>{String(task.id)}</strong><span>Context {String(task.contextId || "—")}</span></div><div><span>{Array.isArray(task.artifacts) ? task.artifacts.length : 0} artifacts</span><span>{Array.isArray(task.history) ? task.history.length : 0} messages</span></div><button className="button secondary" onClick={() => onInspect(String(task.id))}>Inspect</button></article>; })}</div>}</div>;
}

function CardCompliance({ discovery, copied, onCopy }: { discovery: DiscoverResponse; copied: boolean; onCopy: () => void }) {
  const [view, setView] = useState<"report" | "raw" | "normalized">("report");
  return <div className="card-page"><div className="section-heading"><div><h1>Agent Card & compliance</h1><p>Structural checks are version-aware; wire behavior belongs in the A2A TCK.</p></div><div className="segmented text"><button className={view === "report" ? "active" : ""} onClick={() => setView("report")}>Report</button><button className={view === "raw" ? "active" : ""} onClick={() => setView("raw")}>Raw</button><button className={view === "normalized" ? "active" : ""} onClick={() => setView("normalized")}>Normalized</button></div></div>{view === "report" ? <><section className="report-hero"><ScoreRing score={discovery.report.score} /><div><span className="eyebrow">Detected protocol</span><h2>A2A {discovery.report.version}</h2><p>{discovery.report.counts.error === 0 ? "No blocking Agent Card issues found." : `${discovery.report.counts.error} blocking issue${discovery.report.counts.error === 1 ? "" : "s"} found.`}</p></div></section><div className="issue-list">{discovery.report.issues.length === 0 ? <div className="all-clear"><CircleCheck size={20} /><div><strong>All selected checks passed</strong><p>Continue with behavior testing and the official TCK.</p></div></div> : discovery.report.issues.map((issue) => <article key={`${issue.id}-${issue.path}`} className={issue.severity}><span>{issue.severity === "error" ? <CircleX size={17} /> : issue.severity === "warning" ? <CircleAlert size={17} /> : <Activity size={17} />}</span><div><header><strong>{issue.message}</strong><code>{issue.path}</code></header>{issue.spec && <p>{issue.spec}</p>}</div></article>)}</div></> : <section className="json-panel"><header><div><FileJson size={17} /><strong>{view === "raw" ? "Wire Agent Card" : "SDK-normalized Agent Card"}</strong></div><button className="text-button" onClick={onCopy}>{copied ? <><Check size={14} />Copied</> : <><Clipboard size={14} />Copy</>}</button></header><pre>{JSON.stringify(view === "raw" ? discovery.rawCard : discovery.card, null, 2)}</pre></section>}</div>;
}
