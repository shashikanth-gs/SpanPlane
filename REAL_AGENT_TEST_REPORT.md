# Real agent integration report

Tested on 2026-07-29 against unmodified official A2A agent behavior, except for the documented sample-card port correction below.

## Running fixtures

All external repositories and their isolated dependencies live under `/Users/skgs/Views/projects/open-source/testing-a2a-agent/tmp/a2a-official-samples`.

| Fixture | Agent Card | Purpose |
| --- | --- | --- |
| JS multi-transport | `http://localhost:41241/.well-known/agent-card.json` | A2A v1.0 over JSON-RPC, HTTP+JSON, and gRPC (`localhost:41242`) |
| JS sample agent | `http://localhost:41243/.well-known/agent-card.json` | A2A v1.0 streaming reference agent |
| Python Hello World | `http://127.0.0.1:9999/.well-known/agent-card.json` | Independent Python SDK interoperability |
| JS cancellable agent | `http://localhost:41244/.well-known/agent-card.json` | Non-blocking send and task cancellation |
| JS compatibility server | `http://localhost:41245/.well-known/agent-card.json` | A2A v1.0 and v0.3 on all bindings (`localhost:41246` for gRPC) |
| Python AgentAlice | `http://localhost:8001/.well-known/agent.json` | Independent native `a2a-sdk==0.3.0` JSON-RPC agent |

The Movie Agent and ADK Fun Facts agent were not started because they require TMDB/Gemini or Google API credentials. No private environment variables were inspected or reused.

## Workbench results

### Version and transport matrix

Every entry passed both non-streaming and streaming send through the workbench gateway. Each non-streaming response completed with one artifact. Each stream produced four A2A events, a terminal end event, and no error event.

| Protocol | JSON-RPC | HTTP+JSON | gRPC |
| --- | --- | --- | --- |
| v1.0 | Pass | Pass | Pass |
| v0.3 | Pass | Pass | Pass |

Additional verified behavior:

- Python Hello World discovery, non-streaming send, and streaming send passed; the generated artifact rendered `Hello, World!` in the browser.
- Python AgentAlice produced a 100/100 v0.3 card report. SendMessage and GetTask passed, and its `Go higher` artifact rendered through the browser. Because its card advertises `streaming: false`, the composer correctly selected non-streaming mode and disabled the Stream switch.
- GetTask passed against the JS multi-transport agent.
- ListTasks reached the official agent, but that sample returns only pagination metadata. A direct raw request produced the same result, so this is not a workbench transformation bug.
- A non-blocking send followed immediately by CancelTask returned `TASK_STATE_CANCELED` through the workbench.
- Push configuration create/list/get/delete passed. A temporary local receiver obtained both the artifact update and completed status callback with `application/a2a+json`; the configuration was then deleted and the receiver stopped.
- Browser testing verified a real gRPC v0.3 stream, content-aware artifact rendering, completed task assembly, desktop layout, and a 390 x 844 mobile viewport with no document-level horizontal overflow.
- Browser console contained no application errors.

### Conversation and Operations follow-up

- The Conversation toolbar now exposes `New conversation`. It aborts an active stream and clears messages, artifacts, task/context identifiers, draft attachments, and the latest operation result while preserving the connected agent and wire-event history.
- User messages render in a compact right-aligned lane; agent messages and generated artifacts remain left-aligned. Browser geometry checks confirmed the lanes no longer share the same starting position.
- The Operations tab now explains that it is the direct protocol console and uses A2A method names. Optional controls are capability-aware.
- Operations verification passed for `GetTask`, `ListTasks`, `SubscribeToTask`, `CancelTask`, and push configuration create/get/list/delete. The official sample still returns only `{ "pageSize": 25 }` for `ListTasks`, matching its direct raw response.
- `GetExtendedAgentCard` is disabled for the current fixtures because none advertises `extendedAgentCard: true`; this is an intentional capability boundary rather than an untested enabled action.

### Defects found and fixed

1. Official gRPC `host:port` interface authorities were rejected by HTTP-only SSRF URL validation.
2. Streamed task status and artifact update events were displayed independently instead of being reduced into the observed Task.
3. Interface selection omitted `protocolVersion`, so a v0.3 entry sharing its URL and binding with v1.0 silently selected v1.0.
4. Compatibility interfaces at the same URL were incorrectly reported as duplicate declarations because the compliance key omitted protocol version.
5. The composer defaulted to streaming even when the connected Agent Card explicitly declared streaming unsupported.

Regression coverage was added for gRPC authority validation, streamed Task assembly, version-aware interface selection, and versioned duplicate detection.

## Structured and binary content verification

The Workbench gateway was exercised against the Atlas Mock Travel Planner over A2A v1.0 JSON-RPC with non-text message parts constructed by the official JavaScript SDK.

- A true `data` part with `application/json` completed successfully and remained a structured data part in the stored task history.
- A mixed message containing `text/markdown`, inline `image/png`, and inline `application/zip` parts completed successfully.
- The stored task history preserved every content discriminator, MIME type, and filename.
- The browser composer sent Markdown as a `text/markdown` text part and rendered the local user message as Markdown.
- The browser composer sent typed JSON as a true `application/json` data part and rendered the local user message as structured data.
- Invalid JSON was rejected before network dispatch, and the composer correctly marked Markdown as not advertised by the fixture Agent Card while marking JSON as advertised.
- Unit coverage now verifies SDK request construction for all four v1.0 part variants: `text`, `data`, `raw`, and `url`.
- Content normalization coverage includes v1.0 structured/raw/URL parts and v0.3 URI/bytes file parts.

This verifies Workbench and SDK transport of those inputs. The travel fixture consumes the travel text/JSON and preserves the additional binary inputs; it does not semantically analyze the image or ZIP. A dedicated multimodal echo/checksum fixture remains a roadmap item for continuous rendering tests across every content family, transport, and version.

## Official TCK results

The TCK was run from the official `a2a-tck` repository at the MUST level.

### JS multi-transport agent

- Pytest execution: 149 passed, 21 failed, 65 skipped, 30 deselected.
- Compatibility summary: 82.3%.
- Agent Card: 6/6.
- Report: `/Users/skgs/Views/projects/open-source/testing-a2a-agent/tmp/a2a-official-samples/a2a-tck/reports-multi/compatibility.html`.

Most failures require TCK-specific fixture behavior that the sample agent does not implement, such as returning requested file/data/message variants, entering `input-required`, or keeping tasks cancellable/subscribable. The remaining actionable differences are in the official JS SDK/server behavior: REST success/error media types and selected HTTP/gRPC error mappings differ from current TCK expectations.

### Python Hello World agent

- JSON-RPC-focused pytest execution: 67 passed, 6 failed, 162 skipped, 30 deselected.
- Compatibility summary: 83.6%.
- Agent Card: 6/6.
- Active JSON-RPC requirements: 65 passed, 14 failed, 15 skipped (the compatibility aggregator counts unsupported fixture scenarios separately from the six pytest failures).
- Report: `/Users/skgs/Views/projects/open-source/testing-a2a-agent/tmp/a2a-official-samples/a2a-tck/reports-python/compatibility.html`.

Five pytest failures are artifact/message fixture expectations outside the Hello World agent's behavior. The remaining failure maps unsupported content type to JSON-RPC ParseError instead of ContentTypeNotSupportedError.

TCK failures describe the tested agents and SDK implementations; they are not workbench test failures. Workbench requests were also compared directly with raw agent requests when attribution was ambiguous.

## Temporary sample correction

The JS sample-agent listener respects `PORT`, but its Agent Card URL was hard-coded to port 41241. Only the temporary clone was changed so the advertised URL uses the same `PORT` value as the listener. No upstream repository or project source was modified for this correction.
