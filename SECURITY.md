# Security Policy

## Supported versions

Security fixes are applied to the latest published minor version of A2A Workbench.

## Reporting a vulnerability

Do not file public issues for vulnerabilities, credential exposure, SSRF bypasses, or unsafe artifact handling. Use the repository’s private GitHub Security Advisory reporting flow and include:

- A concise impact statement.
- Reproduction steps or a minimal proof of concept.
- Affected version and environment.
- Any mitigation you have already identified.

We will acknowledge reports promptly, investigate privately, and coordinate a fix and disclosure timeline with the reporter.

## Operating guidance

A2A Workbench is a local development tool that connects to agent-controlled URLs. Keep it bound to `127.0.0.1` by default, treat agent credentials as sensitive, and avoid testing untrusted endpoints from a network that can reach internal services. The Workbench includes URL safety checks and telemetry redaction, but these controls do not replace normal network isolation and credential hygiene.
