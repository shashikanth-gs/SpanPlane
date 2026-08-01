<div align="center">
  <img src="src/app/icon.svg" width="128" alt="SpanPlane Logo" />
  <h1>SpanPlane</h1>
  <p><em>The ultimate protocol test studio for A2A agents.</em></p>
</div>

<p align="center">
  <a href="https://github.com/shashikanth-gs/spanplane/actions/workflows/ci.yml"><img src="https://github.com/shashikanth-gs/spanplane/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/spanplane"><img src="https://img.shields.io/npm/v/spanplane.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/spanplane"><img src="https://img.shields.io/npm/dm/spanplane.svg" alt="npm downloads" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/node/v/spanplane.svg" alt="Node.js" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/shashikanth-gs/spanplane.svg" alt="License" /></a>
  <a href="https://github.com/shashikanth-gs/spanplane/stargazers"><img src="https://img.shields.io/github/stars/shashikanth-gs/spanplane.svg?style=social" alt="GitHub stars" /></a>
  <a href="https://github.com/shashikanth-gs/spanplane/network/members"><img src="https://img.shields.io/github/forks/shashikanth-gs/spanplane.svg?style=social" alt="GitHub forks" /></a>
  <a href="https://github.com/shashikanth-gs/spanplane/issues"><img src="https://img.shields.io/github/issues/shashikanth-gs/spanplane.svg" alt="GitHub issues" /></a>
</p>

SpanPlane is a local-first studio for testing [Agent2Agent (A2A)](https://a2a-protocol.org/) agents as real applications—not just as protocol endpoints. Discover an Agent Card, choose an advertised transport and protocol version, exercise conversations and task operations, inspect streaming lifecycle events, and render agent artifacts according to their declared content type.

It uses the official [`@a2a-js/sdk`](https://github.com/a2aproject/a2a-js) for A2A wire handling. The Workbench does not implement JSON-RPC, HTTP+JSON, gRPC, or version compatibility shims itself.

![SpanPlane showing a completed streamed travel-planning task, structured JSON artifact, advertised interfaces, and A2A wire events](https://raw.githubusercontent.com/shashikanth-gs/spanplane/main/public/screenshots/spanplane-live-travel-session.png)

*A completed A2A v1.0 JSON-RPC session against a deterministic travel-planning agent: agent discovery, task streaming, a structured artifact, the content-aware composer, and the event inspector in one local view.*

> **Status:** developer preview. The local Workbench, A2A v1.0/v0.3 compatibility support, and real-agent test matrix are functional. Scenario automation and direct TCK/ITK orchestration remain roadmap work.

## Run locally

After the first npm release, run without installing anything permanently:

```bash
npx spanplane
```

Or install the command globally:

```bash
npm install -g spanplane
spanplane
```

The Workbench listens on `http://127.0.0.1:3001` by default. The same command also prepares and starts a version-pinned local Phoenix process for OpenTelemetry. The Python environment and local evidence are kept in `.spanplane-data` (or `A2A_DATA_DIR`), so the first run can take longer while Python packages are installed.

If Phoenix cannot start in the default `auto` mode, the A2A and sideband explorer still starts and reports telemetry as unavailable. Use `--telemetry required` in automation when failure to start Phoenix should fail the command, or `--telemetry off` for the lightweight A2A-only process:

```bash
spanplane --port 4567
spanplane --hostname 0.0.0.0 --port 3001
spanplane --telemetry required
spanplane --telemetry off
```

Open the displayed local URL, enter an agent’s `/.well-known/agent-card.json` URL, and select the interface you want to test. Node.js 20.9 or later is required.

## Hosted public demo

The optional demo at [spanplane.allsrc.dev](https://spanplane.allsrc.dev) is a safe place to try public agents: its root is the project/about page and the tester is at `/workbench`. It accepts publicly reachable **HTTPS JSON-RPC and HTTP+JSON** agents without a target allowlist.

The hosted demo deliberately excludes credentials, custom headers, private networks, gRPC, push webhooks, HTTP-only endpoints, and large attachments. Those are available in a local `npx spanplane` installation, where the network and credentials remain under your control.

## What it is for

An agent may advertise a valid Agent Card and still behave poorly in a real client: it may lose context, stream invalid transitions, return incomplete artifacts, or send structured data that is hard to use. SpanPlane makes those behaviors visible during an interactive test session while preserving the evidence needed to investigate them.

It includes:

- Agent Card discovery and version-aware structural checks.
- A2A v1.0 and the official JavaScript SDK’s v0.3 compatibility layer.
- JSON-RPC, HTTP+JSON/REST, and gRPC interface selection.
- Streaming and non-streaming `SendMessage`.
- Resettable conversations with task/context continuation.
- A protocol operations console for get, list, subscribe, cancel, extended-card, and push-configuration methods.
- Task and artifact reduction across streamed status and artifact updates.
- Negotiated sideband events with inline conversation context and a dedicated event explorer.
- A managed or external Phoenix runtime with OTLP endpoints exposed to the local UI.
- Provenance-aware normalization for current OTEL GenAI, older GenAI/OpenLLMetry-style keys, and OpenInference spans, while preserving the original attributes as evidence.
- Append-only, credential-redacted A2A, sideband, runtime, and OTEL evidence contracts.
- Session ZIP export with a chronological JSONL timeline and source-specific evidence files.
- Credential-redacted request, response, and stream telemetry.

## Evidence sources

A2A is always the system of record: the Workbench captures what the agent actually sends—messages, tasks, updates, artifacts, and transport exchanges. Sideband and OpenTelemetry enrich that evidence when an agent supports them; neither is required for an agent to be testable.

Sideband uses the A2A extension mechanism. The Workbench opts in only when an Agent Card advertises an extension URI it understands and uses the official SDK to transmit the version-correct extension service parameter. It supports both metadata-carried events and extension-contributed artifacts. There is no official universal sideband-event schema today, so the included generic contract is explicitly provisional. A built-in compatibility adapter also recognizes the public [`a2a-wrapper`](https://github.com/shashikanth-gs/a2a-wrapper) trace contract, `urn:x-a2a:trace:v1`, and maps its lifecycle, tool, reasoning, decision, delegation, and usage artifacts into Sideband without mixing them with user-facing outputs. Additional deployment contracts can be added with `A2A_SIDEBAND_EXTENSION_URIS`. See [SIDEBAND.md](SIDEBAND.md).

### Out-of-the-box OpenTelemetry Collector

SpanPlane provides a fully managed, local **OpenTelemetry (OTel) Collector** out of the box. You do not need to set up any complex external infrastructure to see what's happening inside your agent. 

To see your agent's internal traces in the "Telemetry" tab, your agent must export its traces via **OTLP/HTTP** to the local collector running on port `6006`.

**1. Point your agent to the collector**
Set the following environment variable in your agent's environment or `.env` file:
```bash
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:6006/v1/traces
```

*(Note: SpanPlane strictly listens for OTLP over HTTP. Do not use the gRPC exporter).*

**Why only `TRACES_ENDPOINT` instead of the root `ENDPOINT`?**
If you set the root `OTEL_EXPORTER_OTLP_ENDPOINT` (e.g., `http://127.0.0.1:6006`), the OTel SDKs will automatically append `/v1/traces` for traces, `/v1/metrics` for metrics, and `/v1/logs` for logs. However, the SpanPlane Workbench is specifically built to visualize **OpenTelemetry GenAI traces** (semantic spans that map out models, agents, tools, prompts, and tokens). It does not currently ingest or display generic infrastructure logs or system metrics. By explicitly asking for the `TRACES` endpoint, we ensure the agent only spends time serializing and exporting the exact trace data that we actually visualize, rather than blasting dropped metrics payloads.

When configured, SpanPlane will instantly capture and visualize deep **Gen AI metrics**, including:
- Tool executions and their raw inputs/outputs
- Retriever queries and embedded document chunks
- LLM prompt traces, generation metrics, and token usage

Under the hood, this is powered by a locally managed instance of **Arize Phoenix**. Correlation uses session, request, A2A context/task/message, and OTEL trace/span identifiers.

The semantic telemetry view adapts documented attribute dialects into one model, usage, tool, retrieval, memory, and evaluation vocabulary. It labels the source dialect and distinguishes missing model spans from model spans that omit usage. It never estimates provider token counts when no exported attribute contains them.

## Content-aware generative UI

> Rendered, structured, and feature-flagged raw views for text, Markdown, JSON, tables, CSV, images, audio, video, PDFs, URLs, archives, and other binary content.

The Workbench reads each A2A part’s content discriminator, `mediaType`, filename, and compatible legacy metadata. It then selects a deterministic renderer—never model-based guessing.

The same renderer is shared by messages, artifacts, and sideband events. Raw views are enabled for trusted local use by default and can be removed from the interface with `A2A_ENABLE_RAW_VIEWS=false`; capture and export remain separate concerns.

Set `A2A_ENABLE_RICH_JSON=true` to add a separate **Experimental** view for structured `application/json` data parts in artifacts and sideband events. It infers safe React presentations such as summary cards, badges, dates, links, lists, nested sections, and tables. It does not replace the existing rendered, structured, or raw views, does not apply to raw byte/file attachments, and never executes agent-provided HTML or JavaScript.

| Returned agent content | Workbench view |
| --- | --- |
| `text/plain` | Text view and raw normalized part |
| `text/markdown` | Rendered Markdown, including GitHub-flavored tables |
| `data` or `application/json` | JSON tree or table; optional Experimental inferred rich UI |
| `text/csv` | Table view |
| `image/*`, `audio/*`, `video/*` | Native media preview |
| `application/pdf` | Sandboxed preview and download |
| `raw`, `url`, ZIP, or unknown binary | Safe preview or download with retained filename and MIME type |

For v1.0, `mediaType` is read from the unified part. For v0.3 compatibility responses, the Workbench also supports legacy nested file MIME/name fields and artifact-level MIME fallback.

## Sending content to an agent

The conversation composer makes the outgoing A2A contract explicit.

| Composer choice | A2A part sent |
| --- | --- |
| Plain text | `text` with `text/plain` |
| Markdown | `text` with `text/markdown` |
| JSON | Validated `data` with `application/json` |
| Attach files | Named inline `raw` byte parts with browser-provided MIME type |

Use the editor for typed Markdown and structured JSON. Use **Attach files** for real files such as images, audio, video, PDFs, ZIP archives, and JSON or Markdown documents that need file semantics. Attachments show their filename, `raw` discriminator, MIME type, and size before they are sent.

The composer compares each selected content type with the connected Agent Card’s default and skill input modes. A **not advertised** indicator warns about a mismatch but does not block the request—an expected `ContentTypeNotSupportedError` can be a valuable negative test.

The UI does not yet include a URL-part editor. The gateway already supports all four A2A v1 content variants (`text`, `data`, `raw`, and `url`); exposing URL parts and advanced per-part overrides is tracked in the [roadmap](ROADMAP.md).

## Where it fits

SpanPlane is designed to answer a specific question: *Does this agent behave well as a real application, across tasks, streams, operations, and rich content?*

It complements—not replaces—the official A2A tools:
- **[A2A Inspector](https://github.com/a2aproject/a2a-inspector)**: For debugging what an agent is advertising and sending during an interactive exchange.
- **[A2A TCK](https://github.com/a2aproject/a2a-tck)**: For asserting that an implementation satisfies normative A2A conformance requirements.
- **[A2A ITK](https://github.com/a2aproject/a2a-itk)**: For verifying interoperability across SDKs, versions, transports, and multi-hop systems.

Workbench is **TCK-tested**, not yet **TCK-integrated**: it is exercised against the official suite, but it does not presently orchestrate, reinterpret, or report TCK runs. See [ROADMAP.md](ROADMAP.md) for the integration boundary.

## Development

```bash
git clone https://github.com/shashikanth-gs/spanplane.git
cd spanplane
npm ci
npm run dev
```

Run the full quality gate:

```bash
npm run check
```

Build and inspect the exact npm package contents:

```bash
npm run package:prepare
npm run package:verify
```

For contribution standards, release configuration, security reporting, and project history, see:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [PUBLISHING.md](PUBLISHING.md)
- [SECURITY.md](SECURITY.md)
- [CHANGELOG.md](CHANGELOG.md)
- [REAL_AGENT_TEST_REPORT.md](REAL_AGENT_TEST_REPORT.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [SIDEBAND.md](SIDEBAND.md)

## Security and local use

The Workbench is intended to run on your machine. It accepts credentials for the agent being tested, keeps them server-side, and redacts them from the event inspector. Localhost and private development agents are allowed by default; keep the Workbench itself on the default `127.0.0.1` host unless you deliberately need LAN access. Review [SECURITY.md](SECURITY.md) before exposing it beyond a trusted development environment.

## License

Apache-2.0. See [LICENSE](LICENSE).
