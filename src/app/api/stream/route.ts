import { recoverMalformedLegacyResult, serializeStreamEvent, streamOperation, type OperationInput } from "@/lib/a2a-gateway";
import type { WireEvent } from "@/lib/workbench-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const frame = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export async function POST(request: Request) {
  let input: OperationInput;
  try { input = await request.json() as OperationInput; }
  catch { return Response.json({ error: { message: "Invalid request JSON." } }, { status: 400 }); }
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let telemetry: WireEvent[] = [];
      try {
        const session = await streamOperation(input);
        telemetry = session.telemetry;
        const { events, client } = session;
        controller.enqueue(frame("meta", { protocolVersion: client.protocolVersion, transport: client.transport.protocolName, telemetry }));
        for await (const event of events) controller.enqueue(frame("a2a", serializeStreamEvent(event)));
        controller.enqueue(frame("end", { telemetry }));
      } catch (error) {
        const recovered = input.connection.diagnosticMode && input.action === "send" ? recoverMalformedLegacyResult(telemetry) : undefined;
        if (recovered !== undefined) {
          controller.enqueue(frame("diagnostic", { message: `The strict SDK rejected this stream, so the raw legacy response is shown for diagnostics: ${error instanceof Error ? error.message : "invalid stream"}` }));
          controller.enqueue(frame("a2a", recovered));
          controller.enqueue(frame("end", { telemetry }));
        } else controller.enqueue(frame("error", { message: error instanceof Error ? error.message : "Streaming request failed." }));
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
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
