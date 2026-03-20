# Open Primitive Protocol -- Launch Thread

**1/**

A protocol for the agent internet.

Not an API. A data envelope standard. Every piece of data an AI agent consumes should carry provenance, freshness, confidence, and a verification chain. Right now, none of it does.

Open Primitive Protocol fixes that.

openprimitive.com/protocol.html

**2/**

The problem: agents consume data naked.

No source authority. No timestamp for when the data was actually observed. No confidence score. No way to verify the payload was not modified in transit.

An agent that looks up water quality and an agent that looks up drug interactions both face the same gap. Raw JSON. Zero metadata about trustworthiness.

**3/**

HTTP solved this for browsers 30 years ago. Content-Type. Cache-Control. TLS certificates. Browsers know what they are looking at, how old it is, and whether the server is legit.

The agent internet has none of this. Agents trust everything by default. That trust is the vulnerability.

**4/**

OPP defines 4 fields every agent-consumable response must carry:

- Source authority (the specific database, not "the government")
- Observation timestamp (when the data was captured, not when the cache was built)
- Confidence score (live federal query > 72-hour-old cache)
- Verification chain (signed hash, no silent mutation)

**5/**

The reference implementation: 16 federal data domains. 10 agencies. EPA water. FDA drugs. CMS hospitals. NHTSA vehicles. BTS airlines. And 11 more.

Every domain returns the same envelope. An agent that reads one response can read all 16.

**6/**

The cross-domain query that no federal agency supports:

GET /v1/safety?zip=48502

Returns EPA water violations, CMS hospital ratings, and FDA food recall proximity in one signed envelope. Three agencies. Three databases. One protocol response.

**7/**

Three agent protocols ship today:

MCP server -- Claude and compatible clients call 16 tools natively.
A2A agent card -- Google Agent-to-Agent discovery and negotiation.
REST API -- standard HTTP for everything else.

One protocol envelope across all three.

**8/**

Stack: Node.js, Express, Vercel serverless. No framework. No build step. 16 source modules.

The question that started this: does federal data get better when AI translates it? The answer became infrastructure. The infrastructure became a protocol.

**9/**

Next: protocol spec published as an open standard. 30+ domains by end of quarter. Historical data archives. Webhook alerts when a zip code gets a new violation. Partner integrations for agent frameworks that want to adopt the envelope format.

**10/**

The agent internet is missing its data layer. APIs exist. Tools exist. What does not exist is a standard that tells agents: here is where this data came from, how old it is, how much to trust it, and proof it was not tampered with.

That standard is OPP.

api.openprimitive.com
openprimitive.com/protocol.html
npx open-primitive-mcp
