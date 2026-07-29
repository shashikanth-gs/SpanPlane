# A2A Workbench

[![CI](https://github.com/shashikanth-gs/a2a-workbench/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/shashikanth-gs/a2a-workbench/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/a2a-workbench.svg)](https://www.npmjs.com/package/a2a-workbench)
[![npm downloads](https://img.shields.io/npm/dm/a2a-workbench.svg)](https://www.npmjs.com/package/a2a-workbench)
[![Node.js](https://img.shields.io/node/v/a2a-workbench.svg)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/shashikanth-gs/a2a-workbench.svg)](LICENSE)

A2A Workbench is a local-first studio for testing [Agent2Agent (A2A)](https://a2a-protocol.org/) agents as real applications—not just as protocol endpoints. Discover an Agent Card, choose an advertised transport and protocol version, exercise conversations and task operations, inspect streaming lifecycle events, and render agent artifacts according to their declared content type.

It uses the official [`@a2a-js/sdk`](https://github.com/a2aproject/a2a-js) for A2A wire handling. The Workbench does not implement JSON-RPC, HTTP+JSON, gRPC, or version compatibility shims itself.

![A2A Workbench showing a completed streamed travel-planning task, structured JSON artifact, advertised interfaces, and A2A wire events](https://raw.githubusercontent.com/shashikanth-gs/a2a-workbench/main/public/screenshots/a2a-workbench-live-travel-session.png)

*A completed A2A v1.0 JSON-RPC session against a deterministic travel-planning agent: agent discovery, task streaming, a structured artifact, the content-aware composer, and the event inspector in one local view.*

> **Status:** developer preview. The local Workbench, A2A v1.0/v0.3 compatibility support, and real-agent test matrix are functional. Scenario automation and direct TCK/ITK orchestration remain roadmap work.

## Run locally

After the first npm release, run without installing anything permanently:

```bash
npx a2a-workbench
```

Or install the command globally:

```bash
npm install -g a2a-workbench
a2a-workbench
```

The Workbench listens on `http://127.0.0.1:3001` by default. Choose a different port or intentionally expose it on your network when needed:

```bash
a2a-workbench --port 4567
a2a-workbench --hostname 0.0.0.0 --port 3001
```

Open the displayed local URL, enter an agent’s `/.well-known/agent-card.json` URL, and select the interface you want to test. Node.js 20.9 or later is required.

## Hosted public demo

The optional demo at [a2a-workbench.allsrc.dev](https://a2a-workbench.allsrc.dev) is a safe place to try public agents: its root is the project/about page and the tester is at `/workbench`. It accepts publicly reachable **HTTPS JSON-RPC and HTTP+JSON** agents without a target allowlist.

The hosted demo deliberately excludes credentials, custom headers, private networks, gRPC, push webhooks, HTTP-only endpoints, and large attachments. Those are available in a local `npx a2a-workbench` installation, where the network and credentials remain under your control. See [DEPLOYMENT.md](DEPLOYMENT.md) for the Vercel setup, server-side protections, and required WAF rate limits.

## What it is for

An agent may advertise a valid Agent Card and still behave poorly in a real client: it may lose context, stream invalid transitions, return incomplete artifacts, or send structured data that is hard to use. A2A Workbench makes those behaviors visible during an interactive test session while preserving the evidence needed to investigate them.

It includes:

- Agent Card discovery and version-aware structural checks.
- A2A v1.0 and the official JavaScript SDK’s v0.3 compatibility layer.
- JSON-RPC, HTTP+JSON/REST, and gRPC interface selection.
- Streaming and non-streaming `SendMessage`.
- Resettable conversations with task/context continuation.
- A protocol operations console for get, list, subscribe, cancel, extended-card, and push-configuration methods.
- Task and artifact reduction across streamed status and artifact updates.
- Credential-redacted request, response, and stream telemetry.

## Content-aware generative UI

> Rendered, structured, and raw views for text, Markdown, JSON, tables, CSV, images, audio, video, PDFs, URLs, archives, and other binary content.

The Workbench reads each A2A part’s content discriminator, `mediaType`, filename, and compatible legacy metadata. It then selects a deterministic renderer—never model-based guessing.

| Returned agent content | Workbench view |
| --- | --- |
| `text/plain` | Text view and raw normalized part |
| `text/markdown` | Rendered Markdown, including GitHub-flavored tables |
| `data` or `application/json` | JSON tree or table for tabular data |
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

| Tool | Primary question it answers |
| --- | --- |
| [A2A Inspector](https://github.com/a2aproject/a2a-inspector) | What is this agent advertising and sending during an interactive exchange? |
| **A2A Workbench** | Does this agent behave well as a real application, across tasks, streams, operations, and rich content? |
| [A2A TCK](https://github.com/a2aproject/a2a-tck) | Does this implementation satisfy normative A2A conformance requirements? |
| [A2A ITK](https://github.com/a2aproject/a2a-itk) | Does this implementation interoperate across SDKs, versions, transports, and multi-hop systems? |

Workbench complements—not replaces—the official tools. It is **TCK-tested**, not yet **TCK-integrated**: it is exercised against the official suite, but it does not presently orchestrate, reinterpret, or report TCK runs. See [ROADMAP.md](ROADMAP.md) for the integration boundary.

## Development

```bash
git clone https://github.com/shashikanth-gs/a2a-workbench.git
cd a2a-workbench
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

## Security and local use

The Workbench is intended to run on your machine. It accepts credentials for the agent being tested, keeps them server-side, and redacts them from the event inspector. Localhost and private development agents are allowed by default; keep the Workbench itself on the default `127.0.0.1` host unless you deliberately need LAN access. Review [SECURITY.md](SECURITY.md) before exposing it beyond a trusted development environment.

## License

Apache-2.0. See [LICENSE](LICENSE).
