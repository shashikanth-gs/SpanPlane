import { assertSafeUrl } from "./url-safety";
import { redactHeaders, redactValue } from "./redact";
import type { AuthConfig, WireEvent } from "./workbench-types";

const MAX_REDIRECTS = 3;
const MAX_CONTENT_LENGTH = 25 * 1024 * 1024;
const MAX_TELEMETRY_BODY = 2 * 1024 * 1024;

export function authHeaders(auth: AuthConfig): Record<string, string> {
  switch (auth.type) {
    case "bearer": return auth.token ? { Authorization: `Bearer ${auth.token}` } : {};
    case "basic": return { Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}` };
    case "apiKey": return auth.name && auth.value ? { [auth.name]: auth.value } : {};
    default: return {};
  }
}

export function createSafeFetch(options: {
  auth: AuthConfig;
  headers: Record<string, string>;
  telemetry: WireEvent[];
  timeoutMs: number;
}): typeof fetch {
  return async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url = typeof input === "string" || input instanceof URL ? new URL(input.toString()) : new URL(input.url);
    let requestInit = init;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      await assertSafeUrl(url.toString());
      const sourceHeaders = input instanceof Request ? input.headers : undefined;
      const headers = new Headers(sourceHeaders);
      new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
      Object.entries(options.headers).forEach(([key, value]) => headers.set(key, value));
      Object.entries(authHeaders(options.auth)).forEach(([key, value]) => headers.set(key, value));
      const signal = requestInit?.signal ?? AbortSignal.timeout(options.timeoutMs);
      const started = performance.now();
      const method = requestInit?.method ?? (input instanceof Request ? input.method : "GET");
      let body: unknown;
      if (typeof requestInit?.body === "string") {
        try { body = redactValue(JSON.parse(requestInit.body)); } catch { body = requestInit.body.slice(0, 8_000); }
      }
      const eventId = crypto.randomUUID();
      options.telemetry.push({
        id: eventId,
        timestamp: new Date().toISOString(),
        phase: "request",
        method,
        url: url.toString(),
        headers: redactHeaders(headers),
        body,
      });
      try {
        const response = await fetch(url, { ...requestInit, headers, signal, redirect: "manual" });
        const durationMs = Math.round(performance.now() - started);
        const responseEvent: WireEvent = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          phase: "response",
          method,
          url: url.toString(),
          status: response.status,
          durationMs,
          headers: redactHeaders(response.headers),
        };
        const contentLength = Number(response.headers.get("content-length") ?? 0);
        if (contentLength > MAX_CONTENT_LENGTH) throw new Error("Agent response exceeds the 25 MB safety limit.");
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          if (!location) throw new Error("Agent returned a redirect without a Location header.");
          if (redirect === MAX_REDIRECTS) throw new Error("Agent exceeded the redirect limit.");
          url = new URL(location, url);
          requestInit = response.status === 303 ? { ...requestInit, method: "GET", body: undefined } : requestInit;
          continue;
        }
        if (response.headers.get("content-type")?.includes("json")) {
          const responseText = await response.clone().text();
          if (responseText.length <= MAX_TELEMETRY_BODY) {
            try { responseEvent.body = redactValue(JSON.parse(responseText)); }
            catch { responseEvent.body = responseText; }
          } else responseEvent.body = `[response body omitted: ${responseText.length} bytes]`;
        }
        options.telemetry.push(responseEvent);
        return response;
      } catch (error) {
        options.telemetry.push({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          phase: "error",
          method,
          url: url.toString(),
          durationMs: Math.round(performance.now() - started),
          body: { message: error instanceof Error ? error.message : "Request failed" },
        });
        throw error;
      }
    }
    throw new Error("Unable to complete request.");
  } as typeof fetch;
}
