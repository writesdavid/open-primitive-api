# Competitor Deep Dive: us-gov-open-data-mcp

**Date:** 2026-03-21
**Repo:** https://github.com/lzinga/us-gov-open-data-mcp
**Author:** lzinga (solo developer)

---

## 1. Vital Signs

| Metric | Value |
|--------|-------|
| Stars | 89 |
| Forks | 16 |
| Contributors | Appears to be 1 (lzinga), with community PRs welcome |
| Last commit | Active as of late Feb / early March 2026 |
| License | MIT |
| Language | TypeScript (98.9%) |
| HN post | [Item 47236272](https://news.ycombinator.com/item?id=47236272) — ~3 weeks ago |

## 2. npm Package

| Metric | Value |
|--------|-------|
| Package name | `us-gov-open-data-mcp` |
| Weekly downloads | 25 |
| Monthly downloads | 507 |
| Install | `npx us-gov-open-data-mcp` or `npm install us-gov-open-data-mcp` |

507 monthly downloads. Not threatening volume yet. The HN post likely drove a spike.

## 3. APIs Covered (36-40+)

**Economic:** Treasury Fiscal Data, FRED, BLS, BEA, EIA
**Legislative:** Congress.gov, Federal Register, GovInfo, Regulations.gov
**Financial:** FEC, Senate Lobbying, SEC, FDIC, CFPB
**Spending:** USAspending, Open Payments
**Health & Safety:** CDC, FDA, CMS, ClinicalTrials.gov, NIH, NHTSA, DOL
**Environment:** EPA, NOAA, NREL, USGS
**Justice:** FBI Crime Data, DOJ News
**Education:** NAEP, College Scorecard, USPTO
**Demographics:** Census, HUD, FEMA
**Other:** BTS, USDA NASS, USDA FoodData, World Bank

They claim 300+ tools across these APIs. The site says 188 tools / 36 APIs. Numbers shift between README and docs — typical of fast iteration or inflation.

## 4. Recent Additions

The deficit reduction example pages on their docs site pull live data from Treasury, FRED, BLS, BEA, USAspending, World Bank, Census, and Congress.gov. This cross-referencing capability is their showcase feature — one query triggers multiple API calls.

## 5. Protocol / Envelope / Provenance Features

**None observed.** This is a raw wrapper project. Key characteristics:

- No data provenance metadata on responses
- No envelope format (no timestamp, source attribution, freshness indicator)
- No confidence scoring or data quality signals
- No "last updated" or "as of" context on returned data
- WASM-sandboxed JS execution for response processing — interesting but not provenance
- Disk-backed caching with no apparent cache-age transparency to the consumer
- They explicitly disclaim accuracy: "some endpoints may return unexpected results"

They built plumbing. They did not build trust infrastructure.

## 6. Registry Presence

| Registry | Listed? |
|----------|---------|
| Glama.ai | Yes — [listing](https://glama.ai/mcp/servers/@lzinga/us-government-open-data-mcp) |
| mcp.so | Not confirmed in search results |
| awesome-mcp-servers | Not confirmed (opengov-mcp-server is listed, not this one) |
| Official MCP Registry | Not confirmed |

Glama listing exists. Not yet on the major directories based on search results.

## 7. Website / Documentation

- **Docs site:** https://lzinga.github.io/us-gov-open-data-mcp/
- Auto-generated TypeScript API reference
- Example pages (deficit reduction comparison, best-case analysis)
- Setup guides for VS Code, Claude Desktop, Cursor
- No standalone website beyond GitHub Pages docs

The docs site is functional but developer-focused. No human-readable data presentation layer.

## 8. Community Activity

- 16 forks — moderate interest
- HN discussion posted ~3 weeks ago (item 47236272)
- Issues and PRs: open for community contributions, especially edge-case fixes and schema accuracy
- Solo maintainer pattern — bus factor of 1
- AI-scaffolded codebase (they disclose this openly)

## 9. What They Do Better Than Open Primitive

1. **Breadth.** 36+ APIs vs. Open Primitive's 8 tools. They cover Treasury, FRED, Congress, SEC, FEC, Census, EPA, USGS, and more. Raw coverage is not close.
2. **MCP native.** They ship as a proper MCP server with stdio and HTTP Stream transport. Agents can plug in directly. Open Primitive has no MCP server yet.
3. **TypeScript SDK.** Every API importable as a standalone typed client. Open Primitive has no SDK.
4. **Cross-referencing.** One query about a drug pulls FDA adverse events, clinical trials, lobbying spend, and congressional activity. Open Primitive tools are siloed.
5. **Developer ergonomics.** `npx` one-liner install. Token-bucket rate limiting. Disk caching. Retry with backoff. Production-grade plumbing.
6. **Free entry.** 18+ APIs require no key at all.

## 10. Their Biggest Weakness — Open Primitive's Exploit

**They have no trust layer.** Every response is raw API output piped through an MCP tool. No provenance. No freshness indicators. No data quality scoring. No attribution metadata. No explanation of what the data means or where it came from.

Their own disclaimer: "some endpoints may return unexpected results." They scaffolded the entire codebase with AI and ask the community to fix accuracy problems. That is a liability dressed as transparency.

**Specific vulnerabilities Open Primitive can exploit:**

1. **No human layer.** Their data is for machines talking to machines. No one reads it directly. Open Primitive serves humans first, agents second. That dual-audience design is a moat.
2. **No editorial voice.** They return JSON. Open Primitive contextualizes data — what does this recall mean, why does this hospital score matter, what should you do with this water quality number.
3. **No provenance envelope.** When Open Primitive ships its MCP layer with source attribution, freshness timestamps, confidence scores, and data lineage — that becomes the differentiation. Agents that care about accuracy will prefer structured trust metadata over raw pipes.
4. **Fragile scaffolding.** AI-generated tool implementations across 36 APIs with one maintainer. Edge cases will rot. Open Primitive's smaller surface area is hand-built and maintained.
5. **No learning dimension.** Open Primitive's third purpose — teaching people which data benefits from AI translation vs. raw reading — has no equivalent in their project. They are infrastructure. Open Primitive is infrastructure plus understanding.

## Bottom Line

us-gov-open-data-mcp is a breadth play built fast with AI scaffolding. It covers 4x the APIs. It has proper MCP transport. It ships on npm.

Open Primitive's response should not be to match their API count. The response is to ship the trust layer they skipped: provenance envelopes, data quality signals, freshness metadata, and human-readable context. Then ship an MCP server that wraps those same 8 tools with that trust metadata baked in.

The race is not who wraps more APIs. The race is who wraps them with enough context that an agent can tell its user: "This data is from the FDA, published 3 days ago, and here is what it means."

---

Sources:
- [GitHub repo](https://github.com/lzinga/us-gov-open-data-mcp)
- [Docs site](https://lzinga.github.io/us-gov-open-data-mcp/)
- [Glama listing](https://glama.ai/mcp/servers/@lzinga/us-government-open-data-mcp)
- [HN discussion](https://news.ycombinator.com/item?id=47236272)
- [Deficit example](https://lzinga.github.io/us-gov-open-data-mcp/examples/deficit-reduction-comparison)
