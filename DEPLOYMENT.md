# Public demo deployment

The public demonstration site is designed for `a2a-workbench.allsrc.dev`.
It is an optional, deliberately constrained companion to the local-first npm
application. Local Workbench stays at `/` and retains the full set of protocol
testing controls.

In demo mode, `/` is the project/about page and `/workbench` is the interactive
tester. The demo does not persist conversations, credentials, attachments, or
agent responses. Browser state lasts only for the current page session; the
server forwards a request only while it is being handled.

## Deploy to Vercel

1. Import `shashikanth-gs/a2a-workbench` into a new Vercel project. Keep the
   framework preset as **Next.js** and use the repository root.
2. Add these **Production** environment variables. The public client flag must
   be present at build time, and the server flag is the authoritative control.

   ```text
   A2A_DEPLOYMENT_MODE=demo
   NEXT_PUBLIC_A2A_DEMO_MODE=true
   A2A_ALLOW_PRIVATE_NETWORKS=false
   ```

3. Deploy from Vercel or connect the `main` branch. Vercel Git integration can
   create previews for pull requests and production deployments for `main`; no
   npm publishing workflow is involved.
4. In the Vercel project, add `a2a-workbench.allsrc.dev` under **Domains**.
   Create the DNS record Vercel displays for that hostname (normally a CNAME
   for a subdomain). Vercel issues and renews the TLS certificate after DNS
   verification.

The app does not embed a hostname, so previews continue to work. Do not enable
demo mode for the local npm workflow unless you intentionally want its reduced
feature set.

## Public-demo security boundary

The hosted app is a server-side A2A client, so it must treat every target URL
and response as untrusted. Demo mode enforces the following in code:

- HTTPS-only Agent Card and URL-part targets; private, loopback, link-local,
  multicast, carrier-grade NAT, documentation, and other non-public address
  ranges are rejected after DNS resolution.
- Redirects are re-validated and may stay only on the same HTTPS agent origin.
  Workbench-provided authentication and custom headers are never forwarded to
  a redirect that changes origin.
- Credentials, custom headers, private-network overrides, malformed-response
  recovery, gRPC, and push-webhook operations are disabled. These are available
  in a local Workbench, where the tester controls the network boundary.
- Agent requests time out after 45 seconds. Demo request bodies are capped at
  2 MB, inline raw attachments at 1 MB per request, Agent Cards at 2 MB, and
  declared agent responses at 25 MB. API responses are `no-store`.
- The UI hides unavailable demo controls, but the API repeats all policy checks
  so a changed browser request cannot bypass them.
- Content Security Policy, anti-framing, MIME-sniffing, referrer, permissions,
  opener, and HSTS headers are sent by the deployment. Artifact content remains
  rendered with safe React components or sandboxed PDF previews.

This means the demo can test any publicly reachable **HTTPS JSON-RPC or
HTTP+JSON A2A agent** without a target allowlist. Run it locally for public or
private gRPC agents, authenticated cards, webhook configuration, HTTP-only
development endpoints, or large attachments.

## Required Vercel controls

Configure these controls in the Vercel dashboard as part of the initial
deployment; they cannot be safely represented as source code because their
rules and quotas belong to the Vercel account.

1. Enable Vercel WAF and add rate rules for `POST /api/discover`,
   `POST /api/operate`, and `POST /api/stream`. A sensible starting point is
   20 discovery requests and 30 operation/stream requests per source IP per
   minute, then tune from actual traffic.
2. Keep Vercel Deployment Protection disabled only for the intended public
   production domain. Leave preview deployments protected if they are not part
   of the demo.
3. Review Vercel Firewall logs and function usage after launch. Lower limits or
   block abusive source IPs rather than widening application permissions.
4. Do not add secrets for end-user agent credentials. The public demo rejects
   them by design. Store only the three deployment-mode values above.

Vercel’s [production checklist](https://vercel.com/docs/production-checklist),
[response-header guidance](https://vercel.com/docs/headers/response-headers),
and [WAF rate-limiting guide](https://examples.vercel.com/kb/guide/add-rate-limiting-vercel)
are the operational references for those settings.

## Validate before going live

```bash
npm run check
A2A_DEPLOYMENT_MODE=demo NEXT_PUBLIC_A2A_DEMO_MODE=true npm run build
```

After the production deployment:

1. Confirm `/` shows the about page and `/workbench` opens the tester.
2. Confirm `http://` and `https://127.0.0.1/` Agent Card URLs are rejected.
3. Confirm an HTTPS public sample agent can be discovered and streamed.
4. Confirm credentials, custom headers, push operations, and a raw attachment
   over 1 MB are rejected.
5. Inspect the response headers and Vercel WAF logs.
