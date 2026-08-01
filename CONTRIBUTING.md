# Contributing to SpanPlane

Thanks for improving SpanPlane. Contributions should make A2A agent behavior easier to observe, test, and explain without replacing the official SDK or conformance tools.

## Local setup

```bash
npm ci
npm run dev
```

The local application runs on port 3001. Use the base URL or Agent Card URL for an agent you are authorized to test.

## Before opening a pull request

```bash
npm run check
npm run package:prepare
npm run package:verify
```

`check` runs linting, unit tests, and a production build. `package:verify` inspects the npm tarball manifest without publishing it.

For user-facing changes, include a short description of the A2A behavior being exercised. For protocol changes, add coverage for both the normalized representation and the SDK request/response boundary where practical.

## Design principles

- Use the official A2A SDK for protocol transport and version compatibility.
- Keep rendering deterministic and driven by A2A content fields and MIME types.
- Treat unsupported advertised capabilities as useful test evidence, not silent fallbacks.
- Do not log credentials, authorization headers, or unredacted secrets.
- Keep the local-first experience usable without a hosted account or service.

## Reporting issues

Use GitHub Issues for reproducible bugs, feature proposals, and documentation gaps. Do not include credentials, private Agent Card URLs, or sensitive agent output. Security issues belong in the private reporting channel described in [SECURITY.md](SECURITY.md).
