import { NextResponse } from "next/server";

export function apiError(error: unknown, status = 502) {
  const message = error instanceof Error ? error.message : "Unexpected gateway error.";
  const name = error instanceof Error ? error.name : "Error";
  const knownStatus = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : undefined;
  return NextResponse.json({ error: { name, message } }, {
    status: knownStatus ?? status,
    headers: { "Cache-Control": "no-store" },
  });
}
