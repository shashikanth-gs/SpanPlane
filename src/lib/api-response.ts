import { NextResponse } from "next/server";

export function apiError(error: unknown, status = 502) {
  const message = error instanceof Error ? error.message : "Unexpected gateway error.";
  const name = error instanceof Error ? error.name : "Error";
  return NextResponse.json({ error: { name, message } }, { status });
}
