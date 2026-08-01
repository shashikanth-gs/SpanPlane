import { recoverMalformedLegacyResult, serializeStreamEvent, streamOperation, type OperationInput } from "@/lib/spanplane-gateway";
import type { WireEvent } from "@/lib/workbench-types";
import { readJsonRequest } from "@/lib/request-guard";
import { extractSidebandEvents } from "@/server/sideband/decoder";
import {
  captureA2AResponse, captureOperationRequest, captureSidebandEvents, captureWireEvents, operationContext,
} from "@/server/evidence/capture";
import { runtimePublicConfig } from "@/server/runtime/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const encoder = new TextEncoder();
const frame = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export async function POST(request: Request) {
  let input: OperationInput;
  try { input = await readJsonRequest<OperationInput>(request); }
  catch (error) { return Response.json({ error: { message: error instanceof Error ? error.message : "Invalid request JSON." } }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
  const context = operationContext(input);
  input = { ...input, ...context };
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let telemetry: WireEvent[] = [];
      try {
        await captureOperationRequest(input, context);
        const session = await streamOperation(input);
        telemetry = session.telemetry;
        const { events, client, negotiatedExtensions } = session;
        controller.enqueue(frame("meta", {
          ...context,
          protocolVersion: client.protocolVersion,
          transport: client.transport.protocolName,
          negotiatedExtensions,
          traceId: context.traceContext.traceId,
          telemetry,
          runtime: runtimePublicConfig(),
        }));
        for await (const event of events) {
          const serialized = serializeStreamEvent(event);
          await captureA2AResponse(serialized, "stream.event", context);
          controller.enqueue(frame("a2a", serialized));
          const sidebandEvents = extractSidebandEvents(serialized, { ...context, negotiatedExtensions });
          await captureSidebandEvents(sidebandEvents);
          for (const sidebandEvent of sidebandEvents) controller.enqueue(frame("sideband", sidebandEvent));
        }
        await captureWireEvents(telemetry, context);
        controller.enqueue(frame("end", { ...context, telemetry }));
      } catch (error) {
        const recovered = input.connection.diagnosticMode && input.action === "send" ? recoverMalformedLegacyResult(telemetry) : undefined;
        if (recovered !== undefined) {
          controller.enqueue(frame("diagnostic", { message: `The strict SDK rejected this stream, so the raw legacy response is shown for diagnostics: ${error instanceof Error ? error.message : "invalid stream"}` }));
          await captureA2AResponse(recovered, "stream.legacy-recovery", context).catch(() => undefined);
          controller.enqueue(frame("a2a", recovered));
          controller.enqueue(frame("end", { ...context, telemetry }));
        } else {
          await captureA2AResponse({ message: error instanceof Error ? error.message : "Streaming request failed." }, "stream.error", context).catch(() => undefined);
          controller.enqueue(frame("error", { ...context, message: error instanceof Error ? error.message : "Streaming request failed." }));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      // The SDK receives the HTTP request abort through its configured timeout;
      // this hook intentionally avoids retaining the stream after the browser leaves.
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
