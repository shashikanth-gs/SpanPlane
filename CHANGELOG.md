# Changelog

All notable changes to SpanPlane are documented here.

## [Unreleased]

### Added

- Negotiated, configurable sideband-event ingestion through the official A2A extension mechanism.
- Inline and dedicated sideband views using the same MIME-aware renderer as agent artifacts.
- Append-only, redacted evidence storage and selective ZIP export for A2A, sideband, OTEL, and runtime records.
- W3C trace-context propagation and Phoenix-backed trace/span correlation, including tool spans.
- A single-command managed Phoenix runtime with external, required, automatic-fallback, and disabled modes.
- Runtime feature flags for raw evidence views.
- Architecture and provisional sideband-contract documentation.

## [0.1.1] - 2026-07-29

### Fixed

- Allow localhost and private development agents by default in local `npx` and global installations.
- Use the standard `.next` directory when Vercel builds the optional public demo.

### Added

- Optional Vercel demo mode with an about-page root and `/workbench` tester route.
- Hosted-demo public-target validation, request limits, redirect protections, secure headers, and deployment guidance.

## [0.1.0] - 2026-07-29

### Added

- Local-first Workbench UI for A2A Agent Card discovery, conversations, task operations, and telemetry.
- A2A v1.0 and v0.3 compatibility testing across JSON-RPC, HTTP+JSON, and gRPC.
- Streaming task status and artifact assembly.
- Content-aware rendered and raw views for text, Markdown, JSON, CSV, media, PDFs, URLs, and binary parts.
- Explicit plain-text, Markdown, and structured-JSON composer modes.
- Inline file attachments as named A2A raw parts with MIME and Agent Card input-mode visibility.
- npm command distribution through `npx spanplane` and `spanplane` after global installation.
