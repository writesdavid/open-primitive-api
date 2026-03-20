# Press Pitches -- Open Primitive Protocol

---

## 1. 404 Media

**Subject: I built the HTTP of agent data -- a protocol that makes data trustworthy for machines**

AI agents consume data with no provenance, no freshness guarantee, and no verification. Every API returns raw JSON. The agent trusts it blindly. That blind trust is how an agent confidently tells you Flint's water is fine when the EPA shows 4 violations in 3 years.

I built the Open Primitive Protocol to fix this. OPP is a data envelope standard for AI agents. Every response carries source authority, observation timestamp, confidence score, and a signed verification chain. The agent does not have to trust the data. It can check.

The reference implementation covers 16 federal data domains across 10 agencies. Water violations from EPA. Drug adverse events from FDA. Hospital ratings from CMS. Vehicle defects from NHTSA. Every domain returns the same envelope format. Cross-domain queries combine data from 3 agencies in one signed response. No federal agency crosses those boundaries. The protocol does.

HTTP gave browsers Content-Type, Cache-Control, and TLS. The agent internet has no equivalent. OPP is a draft of what that equivalent looks like. 16 domains as proof. One person, no funding, no startup.

Live: api.openprimitive.com/protocol

David Hamilton
writesdavid.substack.com

---

## 2. TechCrunch

**Subject: Solo builder ships data envelope protocol for the agent internet -- 16 federal domains as proof**

Open Primitive is not an API. It is a protocol.

AI agents query APIs and get raw JSON with no metadata about trustworthiness. No source authority. No observation timestamp. No confidence score. No way to verify the payload was not modified between the server and the agent. The agent trusts everything by default.

The Open Primitive Protocol defines a standard envelope that every agent-consumable data response should carry. Four fields: source authority, observation timestamp, confidence score, verification chain. The reference implementation proves the format works across 16 federal data domains and 10 agencies.

The cross-domain capability demonstrates why the protocol matters. A single query against a zip code returns EPA water data, CMS hospital scores, and FDA food recall proximity in one signed envelope. Three agencies that were never designed to talk to each other. One protocol that makes their data composable.

Ships with MCP server for Claude, A2A agent card for Google's framework, and standard REST. One envelope format across all three protocols. Solo build. Node.js and Vercel serverless. No framework, no funding, no team.

The pitch from every AI company is "agents will do your research." But agents need a trust layer for the data they consume. OPP is that layer.

Live: api.openprimitive.com/protocol

David Hamilton
writesdavid.substack.com

---

## 3. Ben's Bites

**Subject: The agent internet is missing its data layer -- here is a protocol draft**

HTTP gave browsers Content-Type, Cache-Control, and TLS certificates. Browsers know what they are looking at, how old it is, and whether the server is real.

AI agents have none of this. Every API response arrives as raw JSON. No provenance. No freshness. No confidence score. No verification. The agent trusts everything.

I built the Open Primitive Protocol to define what a trustworthy data response looks like for machines. Four fields in every envelope: source authority, observation timestamp, confidence score, signed verification chain.

16 federal data domains ship as the reference implementation. EPA water. FDA drugs. CMS hospitals. NHTSA vehicles. 10 agencies total. MCP server with 16 tools. A2A agent card. REST API. Same envelope format everywhere.

The cross-domain query is the proof of concept. GET /v1/safety?zip=48502 returns EPA water violations, CMS hospital ratings, and FDA food recall data in one signed envelope. Three agencies. One protocol response.

If you are building agents that answer real questions about safety, health, or infrastructure, the data layer matters more than the model. OPP is a draft of what that layer looks like. Free. Open. No auth required on the reference implementation.

Live: api.openprimitive.com/protocol

David Hamilton
writesdavid.substack.com
