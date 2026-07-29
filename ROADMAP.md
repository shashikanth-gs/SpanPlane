# A2A Workbench roadmap

This roadmap evolves A2A Workbench from an interactive developer preview into an open-source scenario and validation platform while keeping the official A2A SDK, TCK, and ITK as the protocol authorities.

## Guiding principles

- Use official SDK transports; do not handwrite protocol bindings.
- Integrate official validation tools rather than copying their test logic.
- Always identify the SDK, specification, TCK, and ITK revisions behind a result.
- Separate fast structural preflight checks from normative conformance claims.
- Preserve raw evidence and native reports alongside normalized summaries.
- Keep local development simple while making hosted deployments secure by default.
- Treat generated artifacts and task lifecycles as first-class test outputs.

## Current baseline

The developer preview currently provides:

- Agent Card discovery and structural preflight reporting
- A2A v1.0 and SDK-provided v0.3 compatibility
- JSON-RPC, HTTP+JSON, and gRPC
- Streaming and blocking conversations
- Task/context continuation and resettable conversations
- Task, subscription, cancellation, extended-card, and push-configuration operations
- Event telemetry and streamed task/artifact assembly
- Negotiated sideband events rendered inline and in a source-specific timeline
- W3C trace-context propagation and managed or external Phoenix trace correlation
- Append-only local evidence storage with selective A2A, sideband, OTEL, and runtime ZIP export
- MIME-aware rendering for text, structured data, tabular data, documents, media, URLs, and binary downloads
- Real-agent integration evidence across official JavaScript and Python samples
- A deterministic protocol-rich travel scenario agent
- Local npm distribution through `npx a2a-workbench` and global installation
- GitHub Actions CI plus an OIDC-based npm publishing workflow

## Phase 0: open-source foundation

### Deliverables

- Select and add an explicit open-source license **(shipped: Apache-2.0)**
- Add `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md` **(shipped)**
- Document the support policy and compatibility matrix
- Add pull-request CI for lint, unit tests, production build, and dependency review **(CI shipped; dependency review pending)**
- Add issue and pull-request templates
- Define semantic versioning and a changelog/release process **(shipped)**
- Publish a reproducible container image and local compose example
- Add architecture decision records for SDK boundaries, diagnostics, and validation integrations
- Ensure project fixtures and upstream code retain correct licenses and attribution

### Exit criteria

- A new contributor can install, test, and run the Workbench from documented steps.
- Every public build identifies its Workbench and SDK versions.
- Security reports and releases have documented maintainers and processes.

## Phase 1: saved scenarios and regression automation

### Deliverables

- Versioned scenario schema for connection, input parts, transport, protocol version, and expected outcomes
- Assertions for terminal state, status sequence, artifact names/types, task history, timing, and errors
- Golden structured-data and artifact snapshots with opt-in normalization for volatile identifiers/timestamps
- Replay one scenario across selected interface/version combinations
- Scenario collections for streaming, `INPUT_REQUIRED`, cancellation, push, resubscription, and rich artifacts
- Headless CLI using the same gateway and reducers as the UI
- JSON and JUnit export for CI
- Run comparison and regression diff views
- Safe secret references rather than embedding credentials in scenario files
- Complete the content-part test lab: `text`/`data` editor modes and `raw` file attachments are shipped; add a `url` part editor
- Add schema-aware sample payloads to the shipped validated structured-JSON editor
- Add per-part MIME type and filename overrides; Agent Card input-mode warnings are shipped
- Multimodal fixture agent that echoes metadata/checksums and returns known image, audio, video, PDF, archive, Markdown, CSV, and JSON artifacts
- Cross-transport/version content matrix covering inline bytes, URL references, unsupported media errors, and attachment size boundaries

### Exit criteria

- A scenario authored in the UI can run locally and headlessly with equivalent results.
- Failures identify the transport event and assertion responsible.
- CI consumers receive stable exit codes and JUnit output.

## Phase 2: official TCK integration

### What “TCK-integrated” means

TCK integration does **not** mean translating the specification into our own checks or copying tests into the Workbench.

It means the Workbench becomes an orchestration and results surface for an official, pinned A2A TCK distribution:

1. A user selects an agent endpoint, TCK revision, transports, and requirement level.
2. The Workbench launches the unmodified official TCK in an isolated local process, container, or remote worker.
3. The runner streams progress and captures the exact command, revisions, environment metadata, and exit status.
4. Native TCK JSON, HTML, pytest HTML, and JUnit artifacts are preserved.
5. The Workbench renders a navigable summary while linking every result back to the original TCK requirement and native report.
6. Exported evidence remains independently verifiable outside the Workbench.

The label **TCK-integrated** should only be used after that end-to-end path is implemented. Until then, the accurate phrase is **TCK-tested**, accompanied by a specific external run report.

### Required engineering work

#### 1. Version and compatibility model

- Pin every supported TCK run to a repository commit or released version.
- Record the corresponding A2A specification revision.
- Maintain a compatibility table between Workbench, SDK, agent protocol, and TCK revisions.
- Do not assume one current TCK revision validates legacy v0.3 behavior; select an appropriate official revision when available or declare the combination unsupported.

#### 2. Execution backend

- Add a TCK runner abstraction with local-process, container, and future remote-worker implementations.
- Provision the official Python/`uv` runtime and TCK dependencies reproducibly.
- Pass arguments as structured values, never shell-concatenated strings.
- Support transport and MUST/SHOULD/MAY filters, timeouts, cancellation, concurrency limits, and log streaming.
- Resolve network reachability correctly when the target agent and runner are on the host, in containers, or on remote networks.

#### 3. Job and artifact model

- Introduce durable validation runs with queued/running/passed/failed/canceled states.
- Store timestamps, requester, target, versions, selected options, checksums, exit status, and logs.
- Preserve native `compatibility.json`, compatibility HTML, pytest HTML, and JUnit XML outputs.
- Add retention, redaction, download, and deletion policies.

#### 4. Workbench API

Suggested resource-oriented endpoints:

```text
POST   /api/validation/tck/runs
GET    /api/validation/tck/runs/:id
GET    /api/validation/tck/runs/:id/events
POST   /api/validation/tck/runs/:id/cancel
GET    /api/validation/tck/runs/:id/artifacts/:name
```

- Validate all inputs against an allowlisted TCK option schema.
- Reuse URL/network protections for the system-under-test target.
- Keep runner credentials and environment details server-side.

#### 5. User interface

- Add a **Conformance** section separate from the non-normative Agent Card report.
- Show selected TCK/spec revisions prominently.
- Present summaries by transport, normative level, requirement, status, and failure category.
- Link normalized result rows to native report evidence.
- Make incomplete, canceled, or infrastructure-failed runs visually distinct from conformance failures.

#### 6. Security and isolation

- Run TCK jobs with restricted filesystem, CPU, memory, process, and network permissions.
- Prevent command injection and arbitrary pytest argument execution in hosted environments.
- Apply SSRF controls while supporting explicitly trusted private development targets.
- Add authentication, authorization, quotas, audit events, and tenant-scoped artifact storage before shared hosting.
- Scan and patch the pinned runner image and dependencies.

#### 7. CI integration

- Add a headless command/API that waits for completion and returns a stable exit code.
- Publish JUnit and native TCK artifacts in common CI systems.
- Support policies such as “all MUST requirements pass on declared transports.”
- Include links from CI summaries back to the Workbench run when a server deployment exists.

#### 8. Validation of the integration itself

- Test successful, failing, canceled, timed-out, malformed-report, and unreachable-target runs.
- Compare Workbench summaries with the native TCK JSON for lossless attribution.
- Add fixture agents with known pass/fail cases.
- Verify that upgrading the TCK cannot silently change the revision used by existing saved scenarios.

### Exit criteria

- A user can launch a pinned official TCK run without leaving the Workbench.
- Every displayed result is traceable to an untouched native TCK artifact.
- The same run can execute headlessly in CI.
- The Workbench never presents its own structural checks as TCK results.

## Phase 3: official ITK integration

### Deliverables

- Pin and invoke official ITK revisions through an isolated runner
- Define cluster profiles containing SDK languages, SDK versions, agent images, protocols, behaviors, and graph edges
- Support local stable baselines and mounted “current” SDK checkouts
- Surface multi-hop traversal traces and edge-level failures
- Ingest and display ITK compatibility matrix artifacts
- Link Workbench scenarios to an ITK cluster profile where appropriate
- Support PR-sized and nightly-sized scenario suites
- Preserve native ITK metrics and dashboard-compatible outputs

### Exit criteria

- A failing edge identifies source SDK/version, destination SDK/version, transport, behavior, and native trace evidence.
- Runs are reproducible from a checked-in cluster profile and pinned ITK revision.
- Workbench output can coexist with, rather than fork, the official ITK dashboard pipeline.

## Phase 4: enterprise and hosted operation

### Deliverables

- Persistent PostgreSQL/Redis-backed projects, runs, conversations, and task observations
- Authentication, RBAC, organizations, projects, and tenant isolation
- Encrypted secret storage and pluggable identity providers
- Audit trail and configurable retention/redaction policies
- Horizontally scalable job workers and durable queues
- OpenTelemetry traces, metrics, structured logging, SLOs, readiness, and alerting
- Rate limits, quotas, network policies, outbound allowlists, and deployment hardening
- Private agent connectivity through approved runners or customer-managed workers
- Signed reports and provenance metadata where required
- Upgrade policies for A2A, SDK, TCK, ITK, and scenario schema versions

### Exit criteria

- Multiple tenants can execute isolated tests without sharing credentials, traffic, logs, or artifacts.
- Jobs survive application restarts and can be audited end to end.
- Operational and security controls are documented and independently testable.

## Priorities

### Now

- Complete Phase 0 documentation, licensing, CI, and release hygiene.
- Design the saved scenario schema and shared headless execution contract.
- Keep the current v1.0/v0.3 and transport regression suite green.

### Next

- Implement Phase 1 scenario save/replay/assert/export.
- Build the durable validation-run abstraction needed by both TCK and ITK.
- Prototype a local container-based official TCK runner.

### Later

- Add full TCK report ingestion and CI gates.
- Integrate ITK cluster profiles and matrices.
- Add hosted enterprise controls and remote workers.

## Non-goals

- Reimplementing or forking the normative TCK suite inside the Workbench
- Claiming certification based on Workbench-only checks
- Replacing the ITK multi-hop interoperability model with single-agent tests
- Shipping live booking/provider functionality in protocol fixture agents
- Treating diagnostic recovery from malformed peers as evidence of conformance
