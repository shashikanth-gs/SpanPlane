# Sideband event contract

Sideband events provide optional execution context—progress detail, tool activity, retries, approvals, policy decisions, budgets, evaluations, or memory changes—without pretending those concepts are part of the core A2A task state machine.

This repository includes a provisional, implementation-neutral contract. It is **not an official A2A extension**. A2A defines how extensions are declared and activated, while each extension author must define its own URI, schema, behavior, and security rules.

## Negotiation

The built-in provisional URI is:

```text
urn:agent-observability:sideband-events:v1
```

Replace or extend it at runtime without changing code:

```bash
A2A_SIDEBAND_EXTENSION_URIS="https://example.com/extensions/sideband/v1" npx a2a-workbench
```

An agent advertises the contract in its Agent Card:

```json
{
  "capabilities": {
    "streaming": true,
    "extensions": [
      {
        "uri": "urn:agent-observability:sideband-events:v1",
        "description": "Execution context events contributed through A2A metadata.",
        "required": false,
        "params": { "schemaVersion": 1 }
      }
    ]
  }
}
```

The client activates only advertised URIs it understands. The official JavaScript SDK supplies the correct A2A extension service parameter for the selected protocol version and transport. The URI is also contributed on outgoing messages.

## Event envelope

Agents place sideband content in a metadata member named with the extension URI plus `/events`:

```json
{
  "metadata": {
    "urn:agent-observability:sideband-events:v1/events": [
      {
        "id": "evt-42",
        "timestamp": "2026-07-29T12:00:00.000Z",
        "type": "tool.started",
        "title": "Tool started",
        "level": "info",
        "text": "Calling inventory lookup",
        "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
        "spanId": "00f067aa0ba902b7",
        "metadata": { "toolName": "inventory.lookup" }
      }
    ]
  }
}
```

For compatibility, the decoder also accepts the exact URI as the metadata key and `sidebandEvents` or `sideband` inside metadata—but only after the extension URI has been negotiated.

## Supported content

Each event can contribute:

- `text`, `message`, `content`, or `description` as `text/plain`;
- `markdown` as `text/markdown`;
- `data` as `application/json`;
- a complete A2A-compatible `parts` array for text, data, raw bytes, or URLs.

The normalized parts use the same renderer as agent messages and artifacts. Raw views follow the same `A2A_ENABLE_RAW_VIEWS` runtime flag.

Useful correlation fields are `contextId`, `taskId`, `messageId`, `artifactId`, `traceId`, and `spanId`. Missing A2A identifiers are inherited from the A2A envelope containing the metadata.

## Security and limits

Sideband payloads are untrusted agent input. They must not contain credentials, prompts that the client should execute, or unrestricted internal state. The Workbench treats them as displayable evidence, applies the normal safe content renderer, and recursively redacts recognized secret-field names before persistence. Producers should keep events concise and use artifacts for large outputs.
