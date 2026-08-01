import type { TelemetrySpan } from "@/shared/evidence/types";

type JsonObject = Record<string, unknown>;

export type GenAiSpanCategory =
  | "model"
  | "agent"
  | "workflow"
  | "tool"
  | "retrieval"
  | "memory"
  | "embedding"
  | "evaluation"
  | "other";

export type TelemetryDialect = "otel-genai" | "openinference" | "legacy-genai";

export interface GenAiUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface GenAiEvaluation {
  name?: string;
  score?: number;
  label?: string;
  explanation?: string;
}

export interface GenAiRequestSetting {
  key: string;
  label: string;
  value: unknown;
}

export interface GenAiSpanInsight {
  recognized: boolean;
  category: GenAiSpanCategory;
  operation?: string;
  provider?: string;
  legacySystem?: string;
  requestedModel?: string;
  responseModel?: string;
  agentName?: string;
  agentId?: string;
  agentVersion?: string;
  workflowName?: string;
  conversationId?: string;
  conversationCompacted?: boolean;
  previousResponseId?: string;
  outputType?: string;
  streaming?: boolean;
  responseId?: string;
  prompt?: { name?: string; version?: string };
  embeddingDimension?: number;
  finishReasons: string[];
  usage: GenAiUsage;
  totalTokensDerived: boolean;
  durationMs?: number;
  timeToFirstChunkMs?: number;
  outputTokensPerSecond?: number;
  requestSettings: GenAiRequestSetting[];
  tool?: { name?: string; type?: string; callId?: string };
  retrieval?: { dataSourceId?: string; topK?: number; documentCount?: number };
  memory?: { storeId?: string; recordId?: string; recordCount?: number };
  evaluations: GenAiEvaluation[];
  errorType?: string;
  sensitiveAttributeKeys: string[];
  semanticAttributeCount: number;
  rawAttributeCount: number;
  usedLegacyFallbacks: boolean;
  dialects: TelemetryDialect[];
  usageDialect?: TelemetryDialect;
  modelDialect?: TelemetryDialect;
}

export interface GenAiTraceSummary {
  traceCount: number;
  spanCount: number;
  genAiSpanCount: number;
  infrastructureSpanCount: number;
  modelSpanCount: number;
  meteredCallCount: number;
  toolCallCount: number;
  errorCount: number;
  models: string[];
  providers: string[];
  usage: Required<GenAiUsage>;
  averageTimeToFirstChunkMs?: number;
  durationMs?: number;
  usageSpanIds: string[];
  dialects: TelemetryDialect[];
  usageReportingState: "reported" | "model-spans-without-usage" | "no-model-spans";
}

const SENSITIVE_ATTRIBUTES = new Set([
  "gen_ai.input.messages",
  "gen_ai.output.messages",
  "gen_ai.system_instructions",
  "gen_ai.tool.definitions",
  "gen_ai.tool.call.arguments",
  "gen_ai.tool.call.result",
  "gen_ai.retrieval.query.text",
  "gen_ai.retrieval.documents",
  "gen_ai.memory.query.text",
  "gen_ai.memory.records",
  "input.value",
  "output.value",
]);

const SENSITIVE_PREFIXES = [
  "gen_ai.prompt.variable.", "llm.input_messages", "llm.output_messages", "llm.prompts",
  "llm.choices", "retrieval.documents", "tool.parameters", "tool.json_schema",
];

const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function first(attributes: JsonObject, keys: string[]): unknown {
  for (const key of keys) if (attributes[key] !== undefined && attributes[key] !== null) return attributes[key];
  return undefined;
}

function matched(attributes: JsonObject, candidates: Array<[string, TelemetryDialect]>) {
  for (const [key, dialect] of candidates) {
    if (attributes[key] !== undefined && attributes[key] !== null) return { key, dialect, value: attributes[key] };
  }
  return undefined;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function structuredValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function stringList(value: unknown): string[] {
  const structured = structuredValue(value);
  if (Array.isArray(structured)) return structured.map(textValue).filter((item): item is string => Boolean(item));
  const text = textValue(structured);
  return text ? [text] : [];
}

function durationMs(span: TelemetrySpan): number | undefined {
  if (!span.startTime || !span.endTime) return undefined;
  const value = new Date(span.endTime).getTime() - new Date(span.startTime).getTime();
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function categoryFor(operation: string | undefined, span: TelemetrySpan): GenAiSpanCategory {
  if (operation === "execute_tool") return "tool";
  if (operation === "retrieval") return "retrieval";
  if (operation === "embeddings") return "embedding";
  if (operation?.includes("memory")) return "memory";
  if (operation === "invoke_agent" || operation === "create_agent") return "agent";
  if (operation === "invoke_workflow" || operation === "plan") return "workflow";
  if (["chat", "generate_content", "text_completion"].includes(operation ?? "")) return "model";
  const kind = textValue(first(span.attributes, ["openinference.span.kind"]))?.toUpperCase() || span.kind.toUpperCase();
  if (["LLM", "CHAT_MODEL"].includes(kind)) return "model";
  if (kind === "AGENT") return "agent";
  if (["CHAIN", "WORKFLOW"].includes(kind)) return "workflow";
  if (kind === "TOOL") return "tool";
  if (["RETRIEVER", "RERANKER"].includes(kind)) return "retrieval";
  if (kind === "EMBEDDING") return "embedding";
  return "other";
}

function evaluationsFrom(span: TelemetrySpan): GenAiEvaluation[] {
  const evaluations: GenAiEvaluation[] = [];
  const add = (attributes: JsonObject) => {
    const evaluation = {
      name: textValue(attributes["gen_ai.evaluation.name"]),
      score: numberValue(attributes["gen_ai.evaluation.score.value"]),
      label: textValue(attributes["gen_ai.evaluation.score.label"]),
      explanation: textValue(attributes["gen_ai.evaluation.explanation"]),
    };
    if (evaluation.name || evaluation.score !== undefined || evaluation.label || evaluation.explanation) evaluations.push(evaluation);
  };
  add(span.attributes);
  for (const event of span.events) {
    if (!isObject(event) || event.name !== "gen_ai.evaluation.result" || !isObject(event.attributes)) continue;
    add(event.attributes);
  }
  return evaluations;
}

export function genAiSpanInsight(span: TelemetrySpan): GenAiSpanInsight {
  const attributes = span.attributes;
  const operation = textValue(attributes["gen_ai.operation.name"]);
  const requestedModelMatch = matched(attributes, [
    ["gen_ai.request.model", "otel-genai"],
    ["llm.model_name", "openinference"],
  ]);
  const requestedModel = textValue(requestedModelMatch?.value);
  const responseModel = textValue(attributes["gen_ai.response.model"]);
  const providerMatch = matched(attributes, [
    ["gen_ai.provider.name", "otel-genai"],
    ["llm.provider", "openinference"],
  ]);
  const provider = textValue(providerMatch?.value);
  const legacySystem = textValue(first(attributes, ["gen_ai.system", "llm.system"]));
  const inputUsageMatch = matched(attributes, [
    ["gen_ai.usage.input_tokens", "otel-genai"],
    ["gen_ai.usage.prompt_tokens", "legacy-genai"],
    ["llm.token_count.prompt", "openinference"],
  ]);
  const outputUsageMatch = matched(attributes, [
    ["gen_ai.usage.output_tokens", "otel-genai"],
    ["gen_ai.usage.completion_tokens", "legacy-genai"],
    ["llm.token_count.completion", "openinference"],
  ]);
  const totalUsageMatch = matched(attributes, [
    ["gen_ai.usage.total_tokens", "legacy-genai"],
    ["llm.token_count.total", "openinference"],
    ["llm.usage.total_tokens", "openinference"],
  ]);
  const inputTokens = numberValue(inputUsageMatch?.value);
  const outputTokens = numberValue(outputUsageMatch?.value);
  const reportedTotal = numberValue(totalUsageMatch?.value);
  const totalTokens = reportedTotal ?? (inputTokens !== undefined || outputTokens !== undefined ? (inputTokens ?? 0) + (outputTokens ?? 0) : undefined);
  const spanDuration = durationMs(span);
  const timeToFirstChunkSeconds = numberValue(attributes["gen_ai.response.time_to_first_chunk"]);
  const timeToFirstChunkMs = timeToFirstChunkSeconds === undefined ? undefined : timeToFirstChunkSeconds * 1_000;
  const generationMs = spanDuration === undefined ? undefined : Math.max(1, spanDuration - (timeToFirstChunkMs ?? 0));
  const outputTokensPerSecond = outputTokens !== undefined && generationMs !== undefined ? outputTokens / (generationMs / 1_000) : undefined;
  const requestSettings: GenAiRequestSetting[] = [
    ["gen_ai.request.max_tokens", "Max tokens"],
    ["gen_ai.request.temperature", "Temperature"],
    ["gen_ai.request.top_p", "Top P"],
    ["gen_ai.request.top_k", "Top K"],
    ["gen_ai.request.frequency_penalty", "Frequency penalty"],
    ["gen_ai.request.presence_penalty", "Presence penalty"],
    ["gen_ai.request.choice.count", "Choices"],
    ["gen_ai.request.reasoning.level", "Reasoning"],
    ["gen_ai.request.seed", "Seed"],
    ["gen_ai.request.stop_sequences", "Stop sequences"],
  ].flatMap(([key, label]) => attributes[key] === undefined ? [] : [{ key, label, value: structuredValue(attributes[key]) }]);
  const retrievalDocuments = structuredValue(attributes["gen_ai.retrieval.documents"]);
  const sensitiveAttributeKeys = Object.keys(attributes).filter((key) => SENSITIVE_ATTRIBUTES.has(key) || SENSITIVE_PREFIXES.some((prefix) => key.startsWith(prefix)));
  const semanticAttributeCount = Object.keys(attributes).filter((key) => key.startsWith("gen_ai.")).length;
  const category = categoryFor(operation, span);
  const evaluations = evaluationsFrom(span);
  const recognized = semanticAttributeCount > 0 || category !== "other" || evaluations.length > 0;
  const dialects = [...new Set<TelemetryDialect>([
    ...(Object.keys(attributes).some((key) => key.startsWith("gen_ai.") && key !== "gen_ai.system" && !["gen_ai.usage.prompt_tokens", "gen_ai.usage.completion_tokens", "gen_ai.usage.total_tokens", "gen_ai.usage.details.reasoning_tokens"].includes(key)) ? ["otel-genai" as const] : []),
    ...(Object.keys(attributes).some((key) => key.startsWith("llm.") || key === "openinference.span.kind") ? ["openinference" as const] : []),
    ...(Object.keys(attributes).some((key) => key === "gen_ai.system" || ["gen_ai.usage.prompt_tokens", "gen_ai.usage.completion_tokens", "gen_ai.usage.total_tokens", "gen_ai.usage.details.reasoning_tokens"].includes(key)) ? ["legacy-genai" as const] : []),
  ])];
  const usageDialect = inputUsageMatch?.dialect ?? outputUsageMatch?.dialect ?? totalUsageMatch?.dialect;
  const usedLegacyFallbacks = dialects.some((dialect) => dialect !== "otel-genai");

  return {
    recognized,
    category: evaluations.length && category === "other" ? "evaluation" : category,
    operation,
    provider,
    legacySystem,
    requestedModel,
    responseModel,
    agentName: textValue(attributes["gen_ai.agent.name"]),
    agentId: textValue(attributes["gen_ai.agent.id"]),
    agentVersion: textValue(attributes["gen_ai.agent.version"]),
    workflowName: textValue(attributes["gen_ai.workflow.name"]),
    conversationId: textValue(attributes["gen_ai.conversation.id"]),
    conversationCompacted: booleanValue(attributes["gen_ai.conversation.compacted"]),
    previousResponseId: textValue(attributes["gen_ai.request.previous_response.id"]),
    outputType: textValue(attributes["gen_ai.output.type"]),
    streaming: booleanValue(attributes["gen_ai.request.stream"]),
    responseId: textValue(attributes["gen_ai.response.id"]),
    prompt: attributes["gen_ai.prompt.name"] || attributes["gen_ai.prompt.version"] ? {
      name: textValue(attributes["gen_ai.prompt.name"]),
      version: textValue(attributes["gen_ai.prompt.version"]),
    } : undefined,
    embeddingDimension: numberValue(attributes["gen_ai.embeddings.dimension.count"]),
    finishReasons: stringList(first(attributes, ["gen_ai.response.finish_reasons", "llm.finish_reason"])),
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
      reasoningTokens: numberValue(first(attributes, ["gen_ai.usage.reasoning.output_tokens", "gen_ai.usage.details.reasoning_tokens", "llm.token_count.completion_details.reasoning"])),
      cacheReadTokens: numberValue(first(attributes, ["gen_ai.usage.cache_read.input_tokens", "llm.token_count.prompt_details.cache_read"])),
      cacheCreationTokens: numberValue(first(attributes, ["gen_ai.usage.cache_creation.input_tokens", "llm.token_count.prompt_details.cache_write"])),
    },
    totalTokensDerived: totalTokens !== undefined && reportedTotal === undefined,
    durationMs: spanDuration,
    timeToFirstChunkMs,
    outputTokensPerSecond,
    requestSettings,
    tool: category === "tool" || attributes["gen_ai.tool.name"] ? {
      name: textValue(first(attributes, ["gen_ai.tool.name", "tool.name"])),
      type: textValue(attributes["gen_ai.tool.type"]),
      callId: textValue(attributes["gen_ai.tool.call.id"]),
    } : undefined,
    retrieval: category === "retrieval" || attributes["gen_ai.data_source.id"] ? {
      dataSourceId: textValue(attributes["gen_ai.data_source.id"]),
      topK: numberValue(attributes["gen_ai.retrieval.top_k"]),
      documentCount: Array.isArray(retrievalDocuments) ? retrievalDocuments.length : undefined,
    } : undefined,
    memory: category === "memory" || attributes["gen_ai.memory.store.id"] ? {
      storeId: textValue(attributes["gen_ai.memory.store.id"]),
      recordId: textValue(attributes["gen_ai.memory.record.id"]),
      recordCount: numberValue(attributes["gen_ai.memory.record.count"]),
    } : undefined,
    evaluations,
    errorType: textValue(attributes["error.type"]),
    sensitiveAttributeKeys,
    semanticAttributeCount,
    rawAttributeCount: Object.keys(attributes).length,
    usedLegacyFallbacks,
    dialects,
    usageDialect,
    modelDialect: responseModel ? "otel-genai" : requestedModelMatch?.dialect,
  };
}

function hasUsage(insight: GenAiSpanInsight) {
  return Object.values(insight.usage).some((value) => value !== undefined);
}

function usageEquivalent(left: GenAiSpanInsight, right: GenAiSpanInsight) {
  return left.usage.inputTokens === right.usage.inputTokens &&
    left.usage.outputTokens === right.usage.outputTokens &&
    left.usage.totalTokens === right.usage.totalTokens &&
    left.usage.reasoningTokens === right.usage.reasoningTokens &&
    (left.responseModel ?? left.requestedModel) === (right.responseModel ?? right.requestedModel);
}

function overlaps(left: TelemetrySpan, right: TelemetrySpan) {
  if (!left.startTime || !left.endTime || !right.startTime || !right.endTime) return true;
  const leftStart = new Date(left.startTime).getTime(), leftEnd = new Date(left.endTime).getTime();
  const rightStart = new Date(right.startTime).getTime(), rightEnd = new Date(right.endTime).getTime();
  return Math.min(leftEnd, rightEnd) >= Math.max(leftStart, rightStart);
}

function isAncestor(ancestor: TelemetrySpan, descendant: TelemetrySpan, byId: Map<string, TelemetrySpan>) {
  let parentId = descendant.parentSpanId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    if (parentId === ancestor.spanId) return true;
    visited.add(parentId);
    parentId = byId.get(parentId)?.parentSpanId;
  }
  return false;
}

export function summarizeGenAiSpans(spans: TelemetrySpan[]): GenAiTraceSummary {
  const withInsights = spans.map((span) => ({ span, insight: genAiSpanInsight(span) }));
  const recognized = withInsights.filter(({ insight }) => insight.recognized);
  const modelSpans = recognized.filter(({ insight }) => insight.category === "model");
  const byTrace = new Map<string, TelemetrySpan[]>();
  for (const span of spans) byTrace.set(span.traceId, [...(byTrace.get(span.traceId) ?? []), span]);
  const usageEntries = recognized.filter(({ insight }) => hasUsage(insight));
  const usageSpanIds = usageEntries.filter(({ span, insight }) => {
    const traceSpans = byTrace.get(span.traceId) ?? [];
    const byId = new Map(traceSpans.map((item) => [item.spanId, item]));
    return !usageEntries.some(({ span: possibleChild, insight: childInsight }) =>
      possibleChild.traceId === span.traceId && possibleChild.spanId !== span.spanId &&
      isAncestor(span, possibleChild, byId) && overlaps(span, possibleChild) && usageEquivalent(insight, childInsight));
  });
  const usage = usageSpanIds.reduce((total, entry) => ({
    inputTokens: total.inputTokens + (entry.insight.usage.inputTokens ?? 0),
    outputTokens: total.outputTokens + (entry.insight.usage.outputTokens ?? 0),
    totalTokens: total.totalTokens + (entry.insight.usage.totalTokens ?? 0),
    reasoningTokens: total.reasoningTokens + (entry.insight.usage.reasoningTokens ?? 0),
    cacheReadTokens: total.cacheReadTokens + (entry.insight.usage.cacheReadTokens ?? 0),
    cacheCreationTokens: total.cacheCreationTokens + (entry.insight.usage.cacheCreationTokens ?? 0),
  }), { inputTokens: 0, outputTokens: 0, totalTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
  const timestamps = spans.flatMap((span) => [span.startTime, span.endTime]).filter((value): value is string => Boolean(value)).map((value) => new Date(value).getTime()).filter(Number.isFinite);
  const ttfcValues = recognized.map(({ insight }) => insight.timeToFirstChunkMs).filter((value): value is number => value !== undefined);

  return {
    traceCount: new Set(spans.map((span) => span.traceId)).size,
    spanCount: spans.length,
    genAiSpanCount: recognized.length,
    infrastructureSpanCount: spans.length - recognized.length,
    modelSpanCount: modelSpans.length,
    meteredCallCount: usageSpanIds.length,
    toolCallCount: recognized.filter(({ insight }) => insight.category === "tool").length,
    errorCount: recognized.filter(({ span, insight }) => span.statusCode.toUpperCase() === "ERROR" || Boolean(insight.errorType)).length,
    models: [...new Set(recognized.flatMap(({ insight }) => [insight.responseModel, insight.requestedModel]).filter((value): value is string => Boolean(value)))],
    providers: [...new Set(recognized.map(({ insight }) => insight.provider).filter((value): value is string => Boolean(value)))],
    usage,
    averageTimeToFirstChunkMs: ttfcValues.length ? ttfcValues.reduce((sum, value) => sum + value, 0) / ttfcValues.length : undefined,
    durationMs: timestamps.length ? Math.max(...timestamps) - Math.min(...timestamps) : undefined,
    usageSpanIds: usageSpanIds.map(({ span }) => span.spanId),
    dialects: [...new Set(recognized.flatMap(({ insight }) => insight.dialects))],
    usageReportingState: usageSpanIds.length ? "reported" : modelSpans.length ? "model-spans-without-usage" : "no-model-spans",
  };
}
