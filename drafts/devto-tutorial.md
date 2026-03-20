---
title: Make your API agent-readable in 50 lines of code
published: false
tags: ai, agents, protocol, api
---

AI agents call APIs and get raw JSON back. No source. No timestamp. No way to know if the data is 3 seconds old or 3 months old. The agent trusts it anyway, because it has no other option.

This breaks down fast. An agent building a flight recommendation pulls weather data from an endpoint. The JSON says 72 degrees. But 72 degrees *when*? From *where*? The API doesn't say, so the agent can't evaluate it. Every response gets treated as equally trustworthy, which means none of them are.

The Open Primitive Protocol fixes this. OPP wraps existing API responses in a signed envelope that carries provenance, freshness, and confidence. Agents that speak OPP can verify data before they use it. Three additions to a codebase. About 50 lines of code.

## What is OPP?

Three components:

1. **Manifest** -- a JSON file at `/.well-known/opp.json` that declares endpoints and sources.
2. **Envelope** -- a standard wrapper around every response that carries metadata.
3. **Signature** -- an Ed25519 signature so agents can verify the envelope hasn't been tampered with.

Full spec: [openprimitive.com/protocol.html](https://openprimitive.com/protocol.html)

## Step 1: The manifest

Create `/.well-known/opp.json` at the root of the API. This tells agents what gets served and where the data comes from.

```json
{
  "opp_version": "0.1",
  "provider": "your-weather-api.com",
  "sources": [
    {
      "domain": "weather",
      "origin": "NOAA",
      "origin_url": "https://www.weather.gov",
      "endpoints": ["/v1/weather/current"]
    }
  ],
  "public_key": "your-ed25519-public-key-base64"
}
```

Serve it as `application/json`. That's 10 lines and the first thing any OPP-aware agent looks for.

## Step 2: The envelope

A typical response probably looks like this:

```json
{
  "temperature": 72,
  "city": "NYC"
}
```

Wrap it in an OPP envelope:

```js
function wrapInEnvelope(data, source) {
  return {
    opp_version: "0.1",
    domain: source.domain,
    source: source.origin,
    source_url: source.origin_url,
    freshness: new Date().toISOString(),
    data: data,
    confidence: {
      level: "direct",
      reason: "Primary federal source, no transformation"
    },
    citations: [
      {
        title: `${source.origin} Current Conditions`,
        url: source.origin_url,
        accessed: new Date().toISOString()
      }
    ]
  };
}

// In the route handler:
app.get("/v1/weather/current", async (req, res) => {
  const raw = await fetchFromNOAA(req.query.city);
  const envelope = wrapInEnvelope(raw, sources.weather);
  res.json(envelope);
});
```

20 lines. Every response now carries its own provenance.

## Step 3: Signing

Generate an Ed25519 keypair once. Sign every envelope before sending it.

```js
const crypto = require("crypto");

// Generate once, store the private key securely
// const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

const privateKey = crypto.createPrivateKey(process.env.OPP_PRIVATE_KEY);

function signEnvelope(envelope) {
  const payload = JSON.stringify(envelope);
  const signature = crypto.sign(null, Buffer.from(payload), privateKey);
  return {
    ...envelope,
    signature: signature.toString("base64"),
    signed_fields: Object.keys(envelope)
  };
}

// Updated route handler:
app.get("/v1/weather/current", async (req, res) => {
  const raw = await fetchFromNOAA(req.query.city);
  const envelope = wrapInEnvelope(raw, sources.weather);
  const signed = signEnvelope(envelope);
  res.json(signed);
});
```

Agents verify the signature against the public key in the manifest. Tampered responses fail verification. 20 lines.

## See it live

The reference implementation at [api.openprimitive.com](https://api.openprimitive.com) covers 16 federal data domains across 10 agencies. Every endpoint returns a signed OPP envelope. Try it:

```bash
curl https://api.openprimitive.com/v1/water?zip=48502
```

The response carries EPA source authority, observation timestamp, confidence level, and a verification signature. Same envelope format across all 16 domains.

## Connect via MCP

OPP ships as an MCP server. Install it and Claude (or any compatible client) gets native access to all 16 tools:

```bash
npx open-primitive-mcp
```

## Join the registry

Register an API so agents can discover it:

```bash
curl -X POST https://api.openprimitive.com/v1/registry/register \
  -H "Content-Type: application/json" \
  -d '{"manifest_url": "https://your-weather-api.com/.well-known/opp.json"}'
```

The registry crawls the manifest, indexes domains and endpoints, and makes the API discoverable to any agent querying the OPP network.

## Why bother

Agents pick providers they can verify. An OPP envelope tells an agent exactly where data came from, when it was fetched, and whether anyone altered it in transit. APIs without this metadata get used as a last resort.

50 lines of code. Three files. An API goes from opaque to verifiable.

---

Full spec: [openprimitive.com/protocol.html](https://openprimitive.com/protocol.html) | API: [api.openprimitive.com](https://api.openprimitive.com) | npm: [open-primitive-mcp](https://www.npmjs.com/package/open-primitive-mcp)
