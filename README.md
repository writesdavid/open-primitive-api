# Open Primitive Protocol (OPP)

**The data layer of the agent internet.**

OPP defines how data providers make their data agent-consumable, verifiable, and discoverable. Three components: provider manifest, response envelope, query interface.

## The Problem

Agents get data naked. No provenance. No freshness guarantee. No confidence score. No way to verify the source. The agent internet is missing its data envelope.

## The Protocol

| Component | What it does |
|-----------|-------------|
| **Manifest** (`/.well-known/opp.json`) | Declares what data a provider serves, how fresh it is, how to verify it |
| **Response Envelope** | Every response carries domain, source, freshness, confidence, citation, Ed25519 signature |
| **Query Interface** | Standardized HTTP GET endpoints with predictable parameters |

## Conformance Levels

- **Level 1 (Basic):** Manifest + envelope with domain/source/freshness
- **Level 2 (Cited):** Level 1 + confidence scores + citations
- **Level 3 (Verified):** Level 2 + Ed25519 cryptographic proof

## Reference Implementation

Live at [api.openprimitive.com](https://api.openprimitive.com). 16 US federal data domains across 11 agencies. Level 3 compliant — every response is signed.

```bash
curl https://api.openprimitive.com/v1/drugs?name=aspirin
# Returns OPP envelope with proof.type: "DataIntegrityProof"
```

## Quick Start

**Use data from an OPP provider:**
```javascript
const res = await fetch('https://api.openprimitive.com/v1/drugs?name=aspirin');
const data = await res.json();
console.log(data.citations.statement);
// "According to FDA FAERS, aspirin has 601,477 reported adverse events"
```

**Implement OPP for your own data:**
```javascript
// 1. Create /.well-known/opp.json (see spec)
// 2. Wrap responses in the OPP envelope
// 3. Optionally sign with Ed25519
```

## Specification

Full spec: [openprimitive.com/protocol.html](https://openprimitive.com/protocol.html)

Detailed spec: [api.openprimitive.com/spec.html](https://api.openprimitive.com/spec.html)

## SDK

- `sdk/opp-client.js` — Client library for consuming OPP providers
- `sdk/opp-provider.js` — Helper for implementing OPP
- `sdk/opp-validator.js` — Validate OPP conformance

## MCP Server

13 tools for Claude, Cursor, and MCP-compatible agents:

```bash
npx open-primitive-mcp
```

## Links

- [Protocol Spec](https://openprimitive.com/protocol.html)
- [API Reference](https://api.openprimitive.com)
- [Manifesto](https://openprimitive.com/manifesto.html)
- [OpenAPI Spec](https://api.openprimitive.com/openapi.json)
- [OPP Manifest](https://api.openprimitive.com/.well-known/opp.json)

## License

MIT
