import { createSessionExport, parseExportSources } from "@/server/export/session-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  try {
    const sources = parseExportSources(new URL(request.url).searchParams.get("include"));
    if (!sources.length) return Response.json({ error: { message: "Select at least one evidence source." } }, { status: 400 });
    const { archive, count } = await createSessionExport(sessionId, sources);
    return new Response(archive, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="a2a-session-${sessionId}.zip"`,
        "Cache-Control": "no-store",
        "X-Evidence-Count": String(count),
      },
    });
  } catch (error) {
    return Response.json({ error: { message: error instanceof Error ? error.message : "Unable to export session." } }, { status: 400 });
  }
}
