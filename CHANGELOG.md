# Changelog

All notable changes to A2A Workbench are documented here.

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
- npm command distribution through `npx a2a-workbench` and `a2a-workbench` after global installation.
