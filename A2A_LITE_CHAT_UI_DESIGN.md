# Design notes: a lightweight A2A chat UI ("SpanPlane Lite")

> Status: brainstorm / pre-implementation. Nothing in this document has been built.
> This lives on branch `docs/a2a-lite-chat-ui-design` in this repo purely as a parking
> place for design discussion. The intent is to read this later, create a **separate
> new repository**, and implement from there — this is not meant to become part of
> SpanPlane's own codebase or roadmap.

## 1. Goal

Fork the *idea*, not the code, of SpanPlane into a much smaller project: a chatbot/UI
for talking to a single A2A agent, with:

- Real-time streaming (SSE, matching A2A's `message/stream` semantics)
- Rendering for all A2A content types: `text` (plain + Markdown), `data`/`application/json`,
  `raw` files (images, audio, video, PDF, archives, arbitrary binary), and `url` parts
- The A2A **sideband** extension mechanism kept (it's part of the A2A extension
  negotiation model itself, not added observability overhead)
- Built on the official `@a2a-js/sdk`

Explicitly **not** in scope: OpenTelemetry/Phoenix tracing, append-only evidence
capture, session ZIP export, compliance/redaction-for-audit, the protocol-operations
console (get/list/subscribe/cancel/push-config), TCK/ITK-adjacent tooling. All of that
is SpanPlane's actual product; this project is deliberately smaller.

## 2. What SpanPlane already gives us for free

SpanPlane (Apache-2.0 — safe to reuse/fork with attribution) already has a mature,
SDK-correct implementation of everything in scope above. Rather than rebuild it, plan
to **lift these modules** into the new repo:

| Module | Path in SpanPlane | Why it's reusable as-is |
|---|---|---|
| Protocol gateway | `src/lib/spanplane-gateway.ts` | Wraps `@a2a-js/sdk` transport selection (JSON-RPC/HTTP+JSON/gRPC), v1.0/v0.3 compat — already the right abstraction boundary |
| Streaming | `src/lib/sse.ts` | SSE read helper |
| Content model | `src/lib/message-parts.ts`, `src/lib/content.ts`, `src/lib/rich-json.ts` | Part discriminator / MIME-type → renderer selection logic |
| Rendering | `src/components/PartRenderer.tsx`, `ArtifactGallery.tsx`, `JsonTree.tsx`, `RichJsonView.tsx` | Deterministic, non-model-guessed rendering for every content type in scope |
| Sideband | `src/server/sideband/decoder.ts`, `src/components/SidebandPanel.tsx` | Agent-Card-negotiated extension decode — matches the "keep it, it's A2A itself" requirement |
| Request safety | `src/lib/request-guard.ts`, `src/lib/url-safety.ts`, `src/lib/safe-fetch.ts` | SSRF protections — this is security, not observability, keep it |

Explicitly **leave behind**: `TelemetryPanel.tsx`, `genai-telemetry.ts`,
`execution-timeline.ts`, all of `src/server/evidence/*` and `src/server/export/*`,
`compliance.ts`, `api/telemetry/*`, `api/sessions/[id]/export`, `api/runtime`,
`bin/runtime/phoenix.mjs`.

`A2AWorkbench.tsx` itself is **not** reusable as-is — it directly imports
`TelemetryPanel` and `execution-timeline` inline, so the new chat UI needs a new,
smaller top-level component composed from the reusable pieces above, not a trimmed
copy of the Workbench.

Because these modules are Apache-2.0, either copy them into the new repo (fork-style)
or extract them into a small shared internal package later if we ever want the two
projects to track upstream fixes together. Default to **copy now**, extract later only
if duplication actually becomes painful — don't build a monorepo/package-sharing setup
speculatively.

## 3. Prior-art survey (why not just use one of these)

| | a2a-community/a2a-ui | a2anet/a2a-ui | a2aproject/a2a-inspector (official) | iChintanSoni/a2a-ui | a2a-cli (official, Go) |
|---|---|---|---|---|---|
| Stack | Next.js 15 + shadcn | Next.js + MUI | Python FastAPI + TS frontend | Next.js + shadcn | Go, wraps `a2a-go` SDK |
| Agent comms | **Direct browser→agent** (requires CORS on the agent) | Server-mediated, official A2A JS SDK | WebSocket via backend | Server-mediated (`/server` API routes) | n/a |
| State | Context + localStorage | Context (Task/Context model) | — | Redux slices + IndexedDB, hook-chain (`useA2AConnection`/`useA2ASession`/`useA2AMessages`) | — |
| Tests/CI | None documented | None (roadmap item) | pre-commit, mypy, ruff, jscpd, GH Actions | Playwright e2e + Vitest unit | — |
| Auth | None documented | None documented | None documented | None documented | Hierarchical config (flags/env/.env) |
| Transport abstraction | — | Official SDK client | JSON-RPC 2.0 only | — | **Plugin transports** via a `Transport` interface |
| Deploy | — | — | Docker | Docker + compose | Single binary |

Takeaways:

- The direct-browser-to-agent pattern (a2a-community) is a non-starter for anything
  enterprise: credentials in the browser, CORS dependency on agents we don't control,
  no place to put a proxy/audit/rate-limit layer later.
- iChintanSoni's hook-chain + real test pyramid + Docker is the most "grown up"
  reference architecture here, even though it's workbench-shaped, not a minimal chat.
- **None of the four community projects have any authentication story** — this is a
  gap every one of them left unsolved, and it's the one we're deliberately designing
  in from day one (see §5).
- a2a-cli's plugin-transport boundary is a good idea SpanPlane's gateway already
  implements in TS — nothing to import there, just confirms the shape is right.

## 4. Recommended architecture

1. **Server-mediated, not browser-direct.** Next.js API routes proxy to the agent via
   the lifted `spanplane-gateway.ts`. Credentials/tokens never reach the browser.
2. **Rendering + sideband: lifted from SpanPlane** (§2) — already ahead of every
   community alternative on content-type coverage.
3. **State: hook-chain, backed by Zustand** (decided). Mirrors iChintanSoni's
   separation of concerns (`useA2AConnection` / `useA2ASession` / `useA2AMessages` /
   equivalents) without Redux's boilerplate for a UI this size.
4. **No append-only evidence/export layer.** Optional, pluggable session persistence
   (resume-on-refresh only) behind a narrow interface, so an audit trail can be added
   later without a rewrite — but not built now.
5. **Auth as a first-class seam from day one** — full design in §5.
6. **Test pyramid + CI from the start**: reuse SpanPlane's existing Vitest/ESLint/CI
   baseline as a starting config, add Playwright e2e specifically for streaming chat
   flows (the one surface none of the prior-art projects test).
7. **Containerize** (Dockerfile, optional compose) — matches a2a-inspector and
   iChintanSoni; makes enterprise deployment straightforward later.

## 5. Authentication design (two independent, both-optional planes)

The requirement is auth on **both sides**, each independently optional:

### Plane A — user → chat app (OIDC login to use the UI at all)

- Standard OIDC Relying Party flow: Authorization Code + PKCE, redirect to the
  enterprise IdP (Okta/Azure AD/Auth0/Keycloak/anything OIDC-compliant), callback
  route exchanges the code server-side, session is an httpOnly cookie — the ID/access
  token itself never lands in browser-accessible storage.
- Discovery via the IdP's own `.well-known/openid-configuration`, configured by issuer
  URL + client id/secret via env — no hardcoded provider.
- On Next.js, Auth.js (NextAuth v5)'s generic OIDC provider is the natural fit —
  it's the de-facto standard for this in the Next.js ecosystem and avoids hand-rolling
  the redirect/PKCE/state-CSRF plumbing.
- **Optional**: when unset, the app runs in open/local mode (matches SpanPlane's own
  "local-first" posture) — this must be a deliberate runtime flag, not an accident of
  missing config.

### Plane B — chat app (as A2A client) → agent (per-agent auth, per the A2A spec)

This is the part that needs to follow the A2A spec precisely, not a generic OAuth
integration:

- An Agent Card declares its auth requirements under `securitySchemes`, using
  OpenAPI-aligned scheme types: `apiKey`, `http` (bearer), `oauth2`, `openIdConnect`,
  `mtls`. The client's job is **discovery → out-of-band credential acquisition →
  attach to every request** — the spec deliberately doesn't mandate how credentials
  are obtained, that's ours to implement per scheme.
- For `openIdConnect` schemes, the scheme carries an `openIdConnectUrl` pointing at
  the agent's own `.well-known/openid-configuration` — same discovery mechanic as
  Plane A, but potentially a completely different IdP/tenant, per agent.
- `@a2a-js/sdk` already has building blocks for this: `AuthenticationHandler` /
  `createAuthenticatingFetchWithRetry` (attach Authorization header, retry on
  401/403), and an `AuthInterceptor` pattern that reads the Agent Card's
  `securitySchemes` and obtains the right credential automatically. Confirm exact
  API shape against the SDK version pinned at implementation time — treat what's
  written here as "this exists, shape may have moved."
- Two sub-cases, both need supporting since enterprises differ:
  - **Service/machine identity** (client-credentials grant, or a static API key/mTLS
    cert): no user interaction, no redirect — the chat app authenticates to the agent
    as itself. Straightforward, do this first.
  - **User-delegated** (`oauth2` with `authorizationCode` flow, or on-behalf-of/token
    exchange): requires the interactive redirect the user asked about — browser is
    sent to the agent's IdP, consent happens, callback lands back in our app, code is
    exchanged **server-side**. Needs PKCE + `state` (CSRF), a redirect-URI allowlist,
    and encrypted server-side token storage.
- **Token storage key**: `(chat-app session/user, agent card URL or issuer+audience)`
  — not global — because one user may have one chat session open against multiple
  agents, each with independent (or no) auth. This is exactly the kind of thing that's
  painful to retrofit, which is why it's called out now even though nothing is built.
- Tokens (access/refresh) live server-side only, associated with the session; the
  browser never sees them directly, mirroring Plane A.
- Planes A and B are intentionally decoupled: Plane B's service-identity mode works
  even with Plane A disabled (fully local/no-login chat against a protected agent),
  and Plane A can be enabled while every connected agent is unauthenticated. Neither
  implies the other.

### Open questions to resolve at implementation time, not now

- Exact `@a2a-js/sdk` auth interceptor API in whatever version is pinned then.
- Whether Plane B's user-delegated mode needs full on-behalf-of/token-exchange (RFC
  8693) support, or whether client-credentials covers the real enterprise agents this
  will be pointed at first — don't build the harder path speculatively.
- Where encrypted token storage lives (in-process/dev vs. a real secret store in
  production) — this should be behind an interface from day one regardless.

## 6. Next steps (once this is read back and a new repo exists)

1. Create the new repo.
2. Copy the modules listed in §2 verbatim, drop the excluded modules.
3. Build the new minimal top-level chat component + hook-chain + Zustand store.
4. Stand up API routes: agent-card discovery, `message/stream`, `message/send`
   (blocking), reusing `spanplane-gateway.ts`.
5. Ship Plane B service-identity auth first (lower complexity), then Plane A OIDC
   login, then Plane B user-delegated redirect flow.
6. Carry over Vitest/ESLint/CI config as a baseline, add Playwright for streaming.
7. Dockerfile + compose once the above is stable.
