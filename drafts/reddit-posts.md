# Reddit Posts — Open Primitive

---

## 1. r/artificial

**Title:** Built an MCP server with 17 federal data tools — FDA drugs, EPA water, CMS hospitals, etc.

Open Primitive is an MCP server that wraps 17 US federal APIs into one interface. Claude (or any MCP-compatible agent) can look up drug adverse events from the FDA, check drinking water violations by ZIP code, compare hospital quality scores, pull OSHA workplace citations, get SEC filing data — all from one server.

Every response includes source provenance. You know which federal agency the data came from and when it was fetched.

Try it: `npx open-primitive-mcp`

Add it to Claude Desktop, Cursor, or any MCP client. 17 tools show up automatically.

The federal data landscape is massive. Right now we cover FDA, EPA, CMS, NHTSA, BLS, Census, SEC, NOAA, OSHA, and a few others. What domains would be most useful to add? IRS tax data? VA healthcare? DOE energy stats?

---

## 2. r/webdev

**Title:** Free API: 17 US government data endpoints in one place (FDA, EPA, CMS, NHTSA, etc.)

Federal APIs are scattered, inconsistent, and half of them return XML from 2008. Open Primitive normalizes 17 of them into one REST API with consistent JSON responses.

Quick example:

```bash
curl "https://api.openprimitive.com/v1/drugs/search?query=metformin"
```

Returns adverse events, recall history, and labeling data from three separate FDA endpoints — stitched into one response.

Also listed on RapidAPI if that's your workflow. Free tier covers most use cases.

Curious what people think about the response format. Right now every response nests data under `source` metadata (agency, endpoint, freshness). Useful or noisy? Would you rather have raw data with source info in headers?

---

## 3. r/datasets

**Title:** Structured API for 17 US federal datasets — FDA, EPA, CMS, BLS, Census, SEC, NOAA

Built an API layer over these federal data sources:

- **FDA** — drug adverse events, recalls, labeling
- **EPA** — drinking water violations, air quality
- **CMS** — hospital quality, Medicare comparisons
- **NHTSA** — vehicle complaints, recall campaigns
- **BLS** — employment, CPI, occupational stats
- **Census** — ACS population and demographic data
- **SEC** — company filings (EDGAR)
- **NOAA** — weather and climate observations
- **OSHA** — workplace safety citations
- Plus 8 more endpoints across DOT, HUD, USDA, etc.

Each endpoint returns structured JSON with source attribution. Historical data is archived where the upstream API only serves current snapshots.

The goal is making federal data accessible without learning 17 different auth schemes, pagination styles, and data formats.

What other federal datasets would be worth adding? I keep hearing requests for FEMA disaster data and NIH clinical trials.

API docs: https://api.openprimitive.com/docs

---

## 4. r/sideproject

**Title:** Launched an API that wraps 17 federal government data sources into one endpoint

The US government publishes extraordinary data. Drug safety reports, hospital ratings, water violations, vehicle defects, workplace injuries. Problem: each agency has its own API with its own quirks, auth, pagination, and format. Some return XML. Some require API keys with 3-week approval processes.

Open Primitive sits in front of 17 of them. One API key, consistent JSON, source metadata on every response.

Built it with Node and Express. Each data source has its own adapter that handles the upstream weirdness — rate limits, XML parsing, pagination cursors, retry logic. Responses get cached with freshness windows tuned per source (drug recalls refresh hourly, Census data refreshes weekly).

Also shipped it as an MCP server so AI agents can query federal data directly.

Next: adding FEMA disaster declarations and NIH clinical trial data. Open to suggestions on what else would be useful.

---

## 5. r/LocalLLaMA

**Title:** MCP server with 17 government data tools — your local LLM can now check FDA drug safety, EPA water quality, etc.

Built an MCP server that gives your LLM access to 17 federal data tools. Drug adverse events, hospital ratings, water safety, vehicle recalls, workplace safety citations, weather data, and more.

Config for Claude Desktop or any MCP client:

```json
{
  "mcpServers": {
    "open-primitive": {
      "command": "npx",
      "args": ["open-primitive-mcp"]
    }
  }
}
```

That's it. 17 tools register automatically. Ask your agent "is my tap water safe?" with a ZIP code and it pulls EPA violation data. Ask about a drug and it checks FDA adverse events.

Every response includes which federal agency sourced the data and when. Signed responses so downstream agents can verify provenance — useful if you're chaining tools in an agentic workflow.

Works with any MCP-compatible client. Anyone running this with local models through something like llama.cpp's MCP support? Curious how smaller models handle tool selection across 17 options.
