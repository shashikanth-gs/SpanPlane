import Link from "next/link";

export function DemoLanding() {
  return (
    <main className="demo-landing">
      <nav className="demo-nav" aria-label="Primary navigation">
        <Link className="demo-brand" href="/"><span>⚡</span>A2A Workbench</Link>
        <a href="https://github.com/shashikanth-gs/a2a-workbench" target="_blank" rel="noreferrer">GitHub</a>
      </nav>
      <section className="demo-hero">
        <p className="demo-eyebrow">Open-source A2A testing workbench</p>
        <h1>Test agents as real applications.</h1>
        <p>A2A Workbench is an interactive studio for Agent Card discovery, task and stream behavior, protocol operations, and content-aware artifacts across A2A v1.0 and v0.3.</p>
        <div className="demo-actions"><Link className="button primary" href="/workbench">Open public demo</Link><a className="button secondary" href="https://www.npmjs.com/package/a2a-workbench" target="_blank" rel="noreferrer">Run locally with npx</a></div>
        <p className="demo-note">The demo tests publicly reachable HTTPS JSON-RPC and HTTP+JSON agents. For authenticated agents, gRPC, private networks, webhooks, and larger files, run Workbench locally.</p>
      </section>
      <section className="demo-grid" aria-label="Workbench capabilities">
        <article><strong>Discover &amp; inspect</strong><p>Read raw and SDK-normalized Agent Cards, select advertised interfaces, and see structural checks.</p></article>
        <article><strong>Exercise behavior</strong><p>Send messages, follow tasks, resume streams, cancel work, and inspect wire evidence.</p></article>
        <article><strong>Render rich output</strong><p>Use rendered, structured, and raw views for text, Markdown, JSON, tables, media, PDFs, URLs, and binary content.</p></article>
      </section>
      <section className="demo-positioning">
        <h2>Where it fits</h2>
        <p>Workbench complements A2A Inspector’s interactive inspection, the official TCK’s normative conformance testing, and ITK’s cross-SDK interoperability coverage. It focuses on the hands-on client experience and the evidence behind it.</p>
      </section>
    </main>
  );
}
