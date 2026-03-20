# Make your API agent-readable in 50 lines of code

AI agents call your API and get raw JSON back. No source. No timestamp. No way to know if the data is 3 seconds old or 3 months old. The agent trusts it anyway, because it has no other option.

This breaks down fast. An agent building a flight recommendation pulls weather data from your endpoint. The JSON says 72 degrees. But 72 degrees *when*? From *where*? Your API doesn't say, so the agent can't evaluate it. It treats every response as equally trustworthy, which means none of them are.

The Open Primitive Protocol fixes this. OPP wraps your existing API responses in a signed envelope that carries provenance, freshness, and confidence. Agents that speak OPP can verify your data before they use it. Three additions to your codebase. About 50 lines of code.

## What is OPP?

Three components:

1. **Manifest** -- a JSON file at `/.well-known/opp.json` that declares your endpoints and sources.
2. **Envelope** -- a standard wrapper around every response that carries metadata.
3. **Signature** -- an Ed25519 signature so agents can verify the envelope hasn't been tampered with.

Full spec: [openprimitive.com/protocol.html](https://openprimitive.com/protocol.html)

## Step 1: The manifest

Create `/.well-known/opp.json` at the root of your API. This tells agents what you serve and where the data comes from.

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

Your current response probably looks like this:

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

// In your route handler:
app.get("/v1/weather/current", async (req, res) => {
  const raw = await fetchFromNOAA(req.query.city);
  const envelope = wrapInEnvelope(raw, sources.weather);
  res.json(envelope);
});
```

20 lines. Every response now carries its own provenance.

## Step 3: Signing

Generate an Ed25519 keypair once. Sign every envelope before you send it.

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

Agents verify the signature against the public key in your manifest. Tampered responses fail verification. 20 lines.

## Validate it

Paste your API base URL at [api.openprimitive.com/validate.html](https://api.openprimitive.com/validate.html). The validator fetches your manifest, calls each endpoint, checks envelope structure, and verifies signatures. Green across the board means you're conformant.

## Join the registry

Register your API so agents can discover it:

```bash
curl -X POST https://api.openprimitive.com/v1/registry/register \
  -H "Content-Type: application/json" \
  -d '{"manifest_url": "https://your-weather-api.com/.well-known/opp.json"}'
```

The registry crawls your manifest, indexes your domains and endpoints, and makes you discoverable to any agent querying the OPP network.

## Why bother

Agents pick providers they can verify. An OPP envelope tells an agent exactly where data came from, when it was fetched, and whether anyone altered it in transit. APIs without this metadata get used as a last resort.

Your API becomes discoverable in the OPP registry. MCP-compatible agents auto-discover OPP endpoints by domain. You stop competing on documentation alone and start competing on trust signals that agents evaluate programmatically.

50 lines of code. Three files. Your API goes from opaque to verifiable.

---

*Open Primitive Protocol is open source. Full spec, reference implementations, and registry at [openprimitive.com](https://openprimitive.com).*
