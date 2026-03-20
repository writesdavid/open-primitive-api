# Show HN: Open Primitive Protocol -- a response envelope standard for AI agents

**URL:** https://api.openprimitive.com

---

**Comment to post immediately after submission:**

AI agents consume data with no provenance, no freshness guarantee, and no way to verify what they got. Every API returns raw JSON. The agent trusts it blindly. That trust is the vulnerability.

The Open Primitive Protocol is an envelope standard for agent-consumable data. Every response carries a signed payload with four fields no current API provides: source authority, observation timestamp, confidence score, and verification chain. The agent does not have to trust the data. It can check.

The reference implementation covers 16 federal data domains. EPA water violations. FDA adverse drug events. CMS hospital ratings. NHTSA vehicle defects. 10 agencies, 16 domains, one envelope format. Every response follows the same protocol structure regardless of which agency produced the underlying data.

What the protocol solves:

- **Provenance.** Every payload identifies the originating federal authority. Not "some government site." The specific database, the specific query, the specific record.
- **Freshness.** Every payload carries an observation timestamp and a cache age. The agent knows whether it is looking at data from 4 hours ago or 4 years ago.
- **Cross-domain intelligence.** A single protocol query against a zip code returns EPA water data, CMS hospital scores, and FDA food recall proximity in one signed envelope. No federal agency crosses those boundaries. The protocol does.
- **Signed responses.** Downstream agents can verify they received the same payload the server sent. No silent mutation in transit.

Three agent protocols ship today. MCP server for Claude and compatible clients. A2A agent card for Google's Agent-to-Agent framework. Standard REST for everything else.

Stack: Node.js. Vercel serverless. No framework. No build step.

The question that started this: does federal data get better when AI translates it? The answer led to infrastructure. The infrastructure led to a protocol.

The protocol spec: https://openprimitive.com/protocol.html
API: https://api.openprimitive.com
npm: npx open-primitive-mcp

Feedback on the envelope format matters more than feedback on the endpoints. The data layer of the agent internet does not exist yet. This is a draft of what it could look like.
