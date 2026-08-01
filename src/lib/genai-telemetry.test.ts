import { describe, expect, it } from "vitest";
import type { TelemetrySpan } from "@/shared/evidence/types";
import { genAiSpanInsight, summarizeGenAiSpans } from "./genai-telemetry";

function span(overrides: Partial<TelemetrySpan> = {}): TelemetrySpan {
  return {
    id: "span", projectId: "project", projectName: "test", traceId: "trace", spanId: "span",
    name: "chat model", kind: "LLM", statusCode: "OK", startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-01T00:00:02.000Z", attributes: {}, events: [], raw: {}, ...overrides,
  };
}

describe("GenAI telemetry semantics", () => {
  it("extracts the standard debugging attributes and derived throughput", () => {
    const insight = genAiSpanInsight(span({ attributes: {
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": "openai",
      "gen_ai.request.model": "requested-model",
      "gen_ai.response.model": "actual-model",
      "gen_ai.request.stream": true,
      "gen_ai.response.time_to_first_chunk": 0.5,
      "gen_ai.usage.input_tokens": 100,
      "gen_ai.usage.output_tokens": 30,
      "gen_ai.usage.reasoning.output_tokens": 5,
      "gen_ai.usage.cache_read.input_tokens": 20,
      "gen_ai.usage.cache_creation.input_tokens": 4,
      "gen_ai.response.finish_reasons": ["stop"],
      "gen_ai.request.temperature": 0.2,
      "gen_ai.prompt.name": "travel-planner",
      "gen_ai.prompt.version": "2.1",
      "gen_ai.embeddings.dimension.count": 1_024,
    } }));

    expect(insight).toMatchObject({
      recognized: true, category: "model", provider: "openai", requestedModel: "requested-model",
      responseModel: "actual-model", streaming: true, timeToFirstChunkMs: 500,
      usage: { inputTokens: 100, outputTokens: 30, totalTokens: 130, reasoningTokens: 5, cacheReadTokens: 20, cacheCreationTokens: 4 },
      prompt: { name: "travel-planner", version: "2.1" },
      embeddingDimension: 1_024,
      dialects: ["otel-genai"], usageDialect: "otel-genai", totalTokensDerived: true,
    });
    expect(insight.outputTokensPerSecond).toBe(20);
    expect(insight.requestSettings).toContainEqual({ key: "gen_ai.request.temperature", label: "Temperature", value: 0.2 });
  });

  it("supports common OpenInference legacy attributes without presenting them as standard", () => {
    const insight = genAiSpanInsight(span({ attributes: {
      "llm.model_name": "legacy-model", "llm.token_count.prompt": 12,
      "llm.token_count.completion": 8, "llm.token_count.total": 20,
      "llm.system": "legacy-provider",
    } }));
    expect(insight).toMatchObject({ requestedModel: "legacy-model", legacySystem: "legacy-provider", provider: undefined, usedLegacyFallbacks: true, dialects: ["openinference"], usageDialect: "openinference" });
    expect(insight.usage.totalTokens).toBe(20);
  });

  it("normalizes older GenAI and extended OpenInference usage keys with provenance", () => {
    const legacy = genAiSpanInsight(span({ attributes: {
      "gen_ai.operation.name": "chat", "gen_ai.usage.prompt_tokens": 21,
      "gen_ai.usage.completion_tokens": 9, "gen_ai.usage.total_tokens": 30,
      "gen_ai.usage.details.reasoning_tokens": 3,
    } }));
    const openInference = genAiSpanInsight(span({ attributes: {
      "openinference.span.kind": "LLM", "llm.provider": "azure",
      "llm.token_count.prompt": 40, "llm.token_count.completion": 10,
      "llm.token_count.prompt_details.cache_write": 7,
      "llm.token_count.completion_details.reasoning": 2,
    } }));

    expect(legacy).toMatchObject({ usageDialect: "legacy-genai", totalTokensDerived: false,
      usage: { inputTokens: 21, outputTokens: 9, totalTokens: 30, reasoningTokens: 3 } });
    expect(openInference).toMatchObject({ provider: "azure", usageDialect: "openinference",
      usage: { inputTokens: 40, outputTokens: 10, totalTokens: 50, cacheCreationTokens: 7, reasoningTokens: 2 } });
  });

  it("flags content-bearing attributes as sensitive", () => {
    const insight = genAiSpanInsight(span({ attributes: {
      "gen_ai.input.messages": "[]",
      "gen_ai.tool.call.arguments": "{\"city\":\"Tokyo\"}",
      "gen_ai.prompt.variable.customer": "Ada",
    } }));
    expect(insight.sensitiveAttributeKeys).toEqual([
      "gen_ai.input.messages", "gen_ai.tool.call.arguments", "gen_ai.prompt.variable.customer",
    ]);
  });

  it("does not double count identical usage repeated on nested wrapper spans", () => {
    const usage = { "gen_ai.usage.input_tokens": 100, "gen_ai.usage.output_tokens": 20, "gen_ai.request.model": "m" };
    const parent = span({ spanId: "parent", endTime: "2026-01-01T00:00:03.000Z", attributes: usage });
    const child = span({ spanId: "child", parentSpanId: "parent", startTime: "2026-01-01T00:00:00.100Z", endTime: "2026-01-01T00:00:02.900Z", attributes: usage });
    const summary = summarizeGenAiSpans([parent, child]);
    expect(summary).toMatchObject({ meteredCallCount: 1, usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 } });
    expect(summary.usageSpanIds).toEqual(["child"]);
  });

  it("distinguishes missing model spans from model spans without usage", () => {
    const agentOnly = summarizeGenAiSpans([span({ kind: "AGENT", attributes: { "gen_ai.agent.name": "planner" } })]);
    const modelWithoutUsage = summarizeGenAiSpans([span({ attributes: { "gen_ai.operation.name": "chat", "gen_ai.request.model": "m" } })]);
    expect(agentOnly.usageReportingState).toBe("no-model-spans");
    expect(modelWithoutUsage.usageReportingState).toBe("model-spans-without-usage");
  });

  it("surfaces tools, retrieval, memory, and evaluation events", () => {
    const tool = genAiSpanInsight(span({ kind: "TOOL", attributes: {
      "gen_ai.operation.name": "execute_tool", "gen_ai.tool.name": "weather", "gen_ai.tool.type": "function",
    } }));
    const retrieval = genAiSpanInsight(span({ kind: "RETRIEVER", attributes: {
      "gen_ai.operation.name": "retrieval", "gen_ai.data_source.id": "travel-docs",
      "gen_ai.retrieval.top_k": 5, "gen_ai.retrieval.documents": "[{\"id\":\"1\"},{\"id\":\"2\"}]",
    } }));
    const memory = genAiSpanInsight(span({ kind: "INTERNAL", attributes: {
      "gen_ai.operation.name": "get_memory", "gen_ai.memory.store.id": "traveler-profile",
      "gen_ai.memory.record.count": 3,
    } }));
    const evaluation = genAiSpanInsight(span({ kind: "UNKNOWN", events: [{
      name: "gen_ai.evaluation.result", attributes: {
        "gen_ai.evaluation.name": "relevance", "gen_ai.evaluation.score.value": 0.9,
        "gen_ai.evaluation.score.label": "pass",
      },
    }] }));

    expect(tool).toMatchObject({ category: "tool", tool: { name: "weather", type: "function" } });
    expect(retrieval).toMatchObject({ category: "retrieval", retrieval: { dataSourceId: "travel-docs", topK: 5, documentCount: 2 } });
    expect(memory).toMatchObject({ category: "memory", memory: { storeId: "traveler-profile", recordCount: 3 } });
    expect(evaluation.evaluations[0]).toMatchObject({ name: "relevance", score: 0.9, label: "pass" });
  });
});
