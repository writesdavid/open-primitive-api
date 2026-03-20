# The agent internet is missing its data layer

Ask Claude if the tap water is safe in Flint, Michigan.

You will get one of two answers. A confident summary from training data, maybe 2023, maybe older. Lead pipes replaced, situation improving, consult local authorities. Or a hedge. "I don't have access to real-time data, but..." followed by five paragraphs of nothing.

Neither answer tells you that ZIP 48502 had 4 EPA Safe Drinking Water Act violations in the last 3 years. Neither gives you the violation codes. Neither tells you when the data was last updated.

The agent sounds like it knows. It does not know.

But this is not a story about water.

## Every piece of data has the same problem

An agent looks up drug interactions. It gets JSON from an API. The JSON has no timestamp. No source authority. No confidence score. The agent treats it as fact and passes it downstream.

An agent checks hospital ratings. The response arrives with no signature, no cache age, no provenance chain. The agent cannot distinguish a live federal record from a stale cache served by a third-party aggregator three hops removed from CMS.

An agent queries food recall status. The data says "no active recalls." But the data is 6 days old, and 2 new recalls posted yesterday. The agent has no way to know. Nothing in the response tells it.

This is the state of agent data consumption in 2026. Raw JSON. No envelope. No metadata about the metadata. The agent trusts everything it receives because the responses give it nothing to evaluate.

The HTTP internet solved this for browsers decades ago. Content-Type headers. Cache-Control. TLS certificates. Browsers know what they are looking at, how old it is, and whether the server is who it claims to be.

The agent internet has none of this. Agents consume data naked.

## The protocol

I built the Open Primitive Protocol to close this gap. OPP defines a standard envelope for agent-consumable data. Four fields that every response must carry:

**Source authority.** The specific federal database that produced this record. Not "government data." The EPA SDWIS system, query ID 48502, enforcement records table.

**Observation timestamp.** When this data was captured from the source. Not when the cache was built. Not when the server processed the request. When the underlying observation happened.

**Confidence score.** How much the agent should trust this response. A live federal API query scores higher than a cached result from 72 hours ago. A cross-referenced result confirmed by 3 agencies scores higher than a single-source lookup.

**Verification chain.** A signed hash so downstream agents can confirm the payload was not modified in transit.

When an agent calls:

```
GET https://api.openprimitive.com/v1/water?zip=48502
```

It gets back EPA violation records for Flint. Real violations. Compliance period dates. Contaminant codes. Direct link to the SDWIS source. And an envelope that tells the agent exactly what it is holding, how fresh it is, and how much to trust it.

The agent stops guessing. It starts evaluating.

## 16 domains prove it works

The reference implementation covers 16 federal data domains across 10 agencies. Water quality. Drug adverse events. Hospital ratings. Food recalls. Vehicle defects. Airline performance. Clinical trials. Nursing home inspections. Workplace safety. Air quality. Medical devices. Health supplements. School safety.

Every domain follows the same envelope. Same provenance format. Same freshness indicators. Same confidence scoring. An agent that learns to read one Open Primitive response can read all 16.

Cross-domain queries work because the envelope is consistent. A single call against a zip code returns EPA water data, CMS hospital scores, and FDA food recall proximity. Three agencies, three databases, one protocol envelope. No federal agency crosses those boundaries. The protocol does.

## The agent internet needs infrastructure

MCP gave agents the ability to call tools. A2A gave agents the ability to find each other. Neither protocol defines what the data itself should look like when it arrives.

That is the missing layer. Not more endpoints. Not more tools. A standard for what a trustworthy data response contains.

The HTTP internet runs on standards that most people never think about. Content negotiation. Cache headers. Certificate chains. These standards let browsers make decisions about data without asking humans. The agent internet needs the same thing.

Open Primitive Protocol is a draft of what that looks like. 16 federal domains as proof. Signed envelopes as the mechanism. Provenance, freshness, confidence, and verification as the minimum bar.

The data was always public. The agents could always reach APIs. What was missing was the envelope that lets an agent evaluate what it received before it passes that data to a human making a decision about water, or drugs, or hospitals, or whether to move their family to a new city.

That envelope is the data layer of the agent internet. I think it matters more than the data itself.

api.openprimitive.com/protocol
