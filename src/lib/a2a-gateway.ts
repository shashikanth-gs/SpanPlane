import {
  AgentCard,
  CancelTaskRequest,
  DeleteTaskPushNotificationConfigRequest,
  GetTaskPushNotificationConfigRequest,
  GetTaskRequest,
  ListTaskPushNotificationConfigsRequest,
  ListTaskPushNotificationConfigsResponse,
  ListTasksRequest,
  ListTasksResponse,
  Message,
  SendMessageRequest,
  StreamResponse,
  SubscribeToTaskRequest,
  Task,
  TaskPushNotificationConfig,
} from "@a2a-js/sdk";
import {
  ClientFactory,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
  RestTransportFactory,
  ServiceParameters,
  withA2AExtensions,
  type Client,
  type RequestOptions,
} from "@a2a-js/sdk/client";
import { GrpcTransportFactory } from "@a2a-js/sdk/client/grpc";
import { validateAgentCard } from "./compliance";
import { enforceDemoConnectionPolicy, enforceDemoOperationPolicy } from "./demo-policy";
import { DEMO_MAX_TIMEOUT_MS, isDemoDeployment } from "./deployment";
import { createSafeFetch, authHeaders } from "./safe-fetch";
import { assertSafeAgentCard, assertSafeInterfaceUrl, assertSafeUrl } from "./url-safety";
import type { ConnectionConfig, DiscoverResponse, OperationAction, OperationResponse, WireEvent } from "./workbench-types";
import { advertisedExtensionUris, negotiateSidebandExtensions } from "../server/sideband/extension";
import { extractSidebandEvents } from "../server/sideband/decoder";

const DEFAULT_TIMEOUT = 60_000;
const MAX_CARD_BYTES = 2 * 1024 * 1024;

function timeout(config: ConnectionConfig) {
  const max = isDemoDeployment() ? DEMO_MAX_TIMEOUT_MS : 180_000;
  return Math.min(Math.max(config.timeoutMs ?? DEFAULT_TIMEOUT, 1_000), max);
}

async function readTextWithinLimit(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return new TextDecoder().decode(Buffer.concat(chunks));
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error(`Agent Card exceeds the ${Math.floor(limit / 1024 / 1024)} MB safety limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

function cardAllowedInDeployment(card: AgentCard): AgentCard {
  if (!isDemoDeployment()) return card;
  const supportedInterfaces = card.supportedInterfaces.filter((item) => item.protocolBinding.toUpperCase() !== "GRPC");
  if (!supportedInterfaces.length) {
    throw new Error("The public demo supports public JSON-RPC and HTTP+JSON endpoints. Run Workbench locally to test gRPC agents.");
  }
  return { ...card, supportedInterfaces };
}

function requestOptions(config: ConnectionConfig, extensions: string[] = [], traceparent?: string): RequestOptions {
  const parameters = { ...config.headers, ...authHeaders(config.auth), ...(traceparent ? { traceparent } : {}) };
  return {
    signal: AbortSignal.timeout(timeout(config)),
    serviceParameters: extensions.length
      ? ServiceParameters.createFrom(parameters, withA2AExtensions(...extensions))
      : parameters,
  };
}

export function selectAdvertisedInterface(
  interfaces: AgentCard["supportedInterfaces"],
  config: Pick<ConnectionConfig, "interfaceUrl" | "protocolBinding" | "protocolVersion">,
) {
  return interfaces.find((item) =>
    (!config.interfaceUrl || item.url === config.interfaceUrl) &&
    (!config.protocolBinding || item.protocolBinding.toUpperCase() === config.protocolBinding.toUpperCase()) &&
    (!config.protocolVersion || item.protocolVersion === config.protocolVersion),
  );
}

export async function discoverAgent(config: ConnectionConfig): Promise<DiscoverResponse & { normalizedCard: AgentCard }> {
  await enforceDemoConnectionPolicy(config);
  await assertSafeUrl(config.cardUrl);
  const telemetry: WireEvent[] = [];
  const started = performance.now();
  const fetchImpl = createSafeFetch({ auth: config.auth, headers: config.headers, telemetry, timeoutMs: timeout(config) });
  const response = await fetchImpl(config.cardUrl, { headers: { Accept: "application/json", "A2A-Version": "1.0" } });
  const body = await readTextWithinLimit(response, MAX_CARD_BYTES);
  let rawCard: Record<string, unknown>;
  try { rawCard = JSON.parse(body) as Record<string, unknown>; }
  catch { throw new Error(`Agent Card returned invalid JSON (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(`Agent Card request failed with HTTP ${response.status}.`);
  const report = validateAgentCard(rawCard);
  const resolver = new DefaultAgentCardResolver({ fetchImpl, legacyCompat: { enabled: true } });
  let normalizedCard: AgentCard;
  try {
    normalizedCard = resolver.normalizeAgentCard(rawCard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Card normalization failed";
    throw new Error(`The card could not be normalized by the official A2A SDK: ${message}`);
  }
  await assertSafeAgentCard(AgentCard.toJSON(normalizedCard) as Record<string, unknown>);
  normalizedCard = cardAllowedInDeployment(normalizedCard);
  return {
    card: AgentCard.toJSON(normalizedCard) as Record<string, unknown>,
    rawCard,
    normalizedCard,
    report,
    telemetry,
    latencyMs: Math.round(performance.now() - started),
    sideband: {
      advertisedUris: advertisedExtensionUris(normalizedCard),
      negotiatedUris: negotiateSidebandExtensions(normalizedCard),
    },
  };
}

async function createClient(config: ConnectionConfig): Promise<{ client: Client; telemetry: WireEvent[]; negotiatedExtensions: string[] }> {
  const discovery = await discoverAgent(config);
  const fetchImpl = createSafeFetch({ auth: config.auth, headers: config.headers, telemetry: discovery.telemetry, timeoutMs: timeout(config) });
  const transports = [
    new JsonRpcTransportFactory({ fetchImpl, legacyCompat: { enabled: true } }),
    new RestTransportFactory({ fetchImpl, legacyCompat: { enabled: true } }),
    ...(!isDemoDeployment() ? [new GrpcTransportFactory({ legacyCompat: { enabled: true } })] : []),
  ];
  let card = discovery.normalizedCard;
  if (config.interfaceUrl || config.protocolBinding || config.protocolVersion) {
    const selected = selectAdvertisedInterface(card.supportedInterfaces, config);
    if (!selected) throw new Error("The selected interface is no longer advertised by the Agent Card.");
    await assertSafeInterfaceUrl(selected.url, selected.protocolBinding);
    card = { ...card, supportedInterfaces: [selected] };
  }
  const factory = new ClientFactory({
    transports,
    preferredTransports: config.protocolBinding ? [config.protocolBinding.toUpperCase()] : undefined,
    cardResolver: new DefaultAgentCardResolver({ fetchImpl, legacyCompat: { enabled: true } }),
  });
  return {
    client: await factory.createFromAgentCard(card),
    telemetry: discovery.telemetry,
    negotiatedExtensions: negotiateSidebandExtensions(card),
  };
}

export interface OperationInput {
  connection: ConnectionConfig;
  action: OperationAction;
  params?: Record<string, unknown>;
  sessionId?: string;
  requestId?: string;
  traceContext?: { traceId: string; spanId: string; traceparent: string };
}

function withNegotiatedExtensions(params: Record<string, unknown>, negotiatedExtensions: string[]) {
  const supplied = Array.isArray(params.extensions) ? params.extensions.filter((value): value is string => typeof value === "string") : [];
  return { ...params, extensions: [...new Set([...supplied, ...negotiatedExtensions])] };
}

export function buildSendRequest(params: Record<string, unknown> = {}): SendMessageRequest {
  const text = typeof params.text === "string" ? params.text : "";
  const suppliedParts = Array.isArray(params.parts) ? params.parts : [];
  const parts = text.trim() ? [{ text, mediaType: "text/plain" }, ...suppliedParts] : suppliedParts;
  if (!parts.length) throw new Error("A message needs at least one content part.");
  return SendMessageRequest.fromJSON({
    tenant: params.tenant ?? "",
    message: {
      messageId: typeof params.messageId === "string" ? params.messageId : crypto.randomUUID(),
      contextId: params.contextId ?? "",
      taskId: params.taskId ?? "",
      role: "ROLE_USER",
      parts,
      metadata: params.metadata,
      extensions: params.extensions ?? [],
      referenceTaskIds: params.referenceTaskIds ?? [],
    },
    configuration: {
      acceptedOutputModes: params.acceptedOutputModes ?? [
        "text/plain", "text/markdown", "text/csv", "application/json", "application/pdf",
        "application/octet-stream", "application/zip", "image/*", "audio/*", "video/*",
      ],
      historyLength: params.historyLength,
      returnImmediately: params.returnImmediately ?? false,
    },
    metadata: params.requestMetadata,
  });
}

function serializeSendResult(value: Awaited<ReturnType<Client["sendMessage"]>>) {
  return "status" in value ? Task.toJSON(value) : Message.toJSON(value);
}

function diagnosticEnvelope(telemetry: WireEvent[]): Record<string, unknown> | undefined {
  const body = [...telemetry].reverse().find((event) => event.phase === "response" && event.body && typeof event.body === "object")?.body;
  return body && typeof body === "object" ? body as Record<string, unknown> : undefined;
}

export function recoverMalformedLegacyResult(telemetry: WireEvent[]): unknown | undefined {
  const envelope = diagnosticEnvelope(telemetry);
  if (!envelope || !("result" in envelope)) return undefined;
  const result = envelope.result;
  if (!result || typeof result !== "object") return result;
  const value = result as Record<string, unknown>;
  const task = value.task;
  if (!task || typeof task !== "object") return result;
  const rawTask = task as Record<string, unknown>;
  const output = rawTask.output && typeof rawTask.output === "object" ? rawTask.output as Record<string, unknown> : {};
  const status = rawTask.status && typeof rawTask.status === "object" ? rawTask.status as Record<string, unknown> : {};
  const state = String(status.state ?? "unknown").toUpperCase();
  return {
    id: rawTask.id ?? `diagnostic-${crypto.randomUUID()}`,
    contextId: rawTask.contextId ?? "",
    status: { ...status, state: state.startsWith("TASK_STATE_") ? state : `TASK_STATE_${state}` },
    artifacts: Array.isArray(output.artifacts) ? output.artifacts : [],
    history: [],
    metadata: {
      diagnosticRecovery: true,
      outputText: output.text,
      outputParts: output.parts,
      originalResult: result,
    },
  };
}

export async function executeOperation(input: OperationInput): Promise<OperationResponse> {
  await enforceDemoOperationPolicy(input);
  const started = performance.now();
  const { client, telemetry, negotiatedExtensions } = await createClient(input.connection);
  const params = input.params ?? {};
  const options = requestOptions(input.connection, negotiatedExtensions, input.traceContext?.traceparent);
  let result: unknown;
  switch (input.action) {
    case "send": {
      try { result = serializeSendResult(await client.sendMessage(buildSendRequest(withNegotiatedExtensions(params, negotiatedExtensions)), options)); }
      catch (error) {
        const recovered = input.connection.diagnosticMode ? recoverMalformedLegacyResult(telemetry) : undefined;
        if (recovered === undefined) throw error;
        result = recovered;
        const sessionId = input.sessionId ?? crypto.randomUUID();
        const requestId = input.requestId ?? crypto.randomUUID();
        return {
          result, telemetry, latencyMs: Math.round(performance.now() - started), protocolVersion: client.protocolVersion, transport: client.transport.protocolName,
          diagnostics: [{ id: "legacy.malformed-result", severity: "warning", path: "$.result", message: `Rendered a non-compliant legacy response after the strict SDK rejected it: ${error instanceof Error ? error.message : "invalid response"}` }],
          sessionId,
          requestId,
          negotiatedExtensions,
          sidebandEvents: extractSidebandEvents(result, { sessionId, requestId, negotiatedExtensions }),
          traceId: input.traceContext?.traceId,
        };
      }
      break;
    }
    case "getTask": result = Task.toJSON(await client.getTask(GetTaskRequest.fromJSON({ tenant: params.tenant ?? "", id: params.taskId, historyLength: params.historyLength }), options)); break;
    case "listTasks": result = ListTasksResponse.toJSON(await client.listTasks(ListTasksRequest.fromJSON({
      tenant: params.tenant ?? "", contextId: params.contextId ?? "", status: params.status ?? "TASK_STATE_UNSPECIFIED", pageSize: params.pageSize ?? 25,
      pageToken: params.pageToken ?? "", historyLength: params.historyLength, statusTimestampAfter: params.statusTimestampAfter,
      includeArtifacts: params.includeArtifacts ?? true,
    }), options)); break;
    case "cancelTask": result = Task.toJSON(await client.cancelTask(CancelTaskRequest.fromJSON({ tenant: params.tenant ?? "", id: params.taskId, metadata: params.metadata }), options)); break;
    case "extendedCard": result = AgentCard.toJSON(await client.getAgentCard(options)); break;
    case "createPushConfig": result = TaskPushNotificationConfig.toJSON(await client.createTaskPushNotificationConfig(TaskPushNotificationConfig.fromJSON({
      tenant: params.tenant ?? "", id: params.configId ?? "", taskId: params.taskId, url: params.url, token: params.token ?? "",
      authentication: params.authentication,
    }), options)); break;
    case "getPushConfig": result = TaskPushNotificationConfig.toJSON(await client.getTaskPushNotificationConfig(GetTaskPushNotificationConfigRequest.fromJSON({ tenant: params.tenant ?? "", taskId: params.taskId, id: params.configId }), options)); break;
    case "listPushConfigs": result = ListTaskPushNotificationConfigsResponse.toJSON(await client.listTaskPushNotificationConfig(ListTaskPushNotificationConfigsRequest.fromJSON({ tenant: params.tenant ?? "", taskId: params.taskId, pageSize: params.pageSize ?? 25, pageToken: params.pageToken ?? "" }), options)); break;
    case "deletePushConfig": await client.deleteTaskPushNotificationConfig(DeleteTaskPushNotificationConfigRequest.fromJSON({ tenant: params.tenant ?? "", taskId: params.taskId, id: params.configId }), options); result = { deleted: true }; break;
    default: throw new Error(`Unsupported operation: ${input.action satisfies never}`);
  }
  const sessionId = input.sessionId ?? crypto.randomUUID();
  const requestId = input.requestId ?? crypto.randomUUID();
  return {
    result,
    telemetry,
    latencyMs: Math.round(performance.now() - started),
    protocolVersion: client.protocolVersion,
    transport: client.transport.protocolName,
    sessionId,
    requestId,
    negotiatedExtensions,
    sidebandEvents: extractSidebandEvents(result, { sessionId, requestId, negotiatedExtensions }),
    traceId: input.traceContext?.traceId,
  };
}

export async function streamOperation(input: OperationInput): Promise<{
  events: AsyncGenerator<StreamResponse, void, undefined>;
  client: Client;
  telemetry: WireEvent[];
  negotiatedExtensions: string[];
}> {
  await enforceDemoOperationPolicy(input);
  const { client, telemetry, negotiatedExtensions } = await createClient(input.connection);
  const params = input.params ?? {};
  const options = requestOptions(input.connection, negotiatedExtensions, input.traceContext?.traceparent);
  const events = input.action === "send"
    ? client.sendMessageStream(buildSendRequest(withNegotiatedExtensions(params, negotiatedExtensions)), options)
    : client.resubscribeTask(SubscribeToTaskRequest.fromJSON({ tenant: params.tenant ?? "", id: params.taskId }), options);
  return { events, client, telemetry, negotiatedExtensions };
}

export function serializeStreamEvent(event: StreamResponse): unknown {
  return StreamResponse.toJSON(event);
}
