# What happens when Claude tries to look up your water quality

Ask Claude if the tap water is safe in Flint, Michigan.

Go ahead. Type it in right now. "Is the water safe to drink in Flint?"

You will get one of two answers. The first: a confident summary cobbled from training data, circa 2023, maybe older. Lead pipes replaced, situation improving, consult local authorities. The second: a careful hedge. "I don't have access to real-time data, but..." followed by five paragraphs of nothing.

Neither answer tells you that the Flint 48502 zip code had 4 EPA Safe Drinking Water Act violations in the last 3 years. Neither gives you the violation codes. Neither links to the federal compliance record. Neither tells you when the data was last updated.

The agent sounds like it knows. It does not know.

## The gap

This is the core problem with AI and public data. Federal agencies collect extraordinary information about the safety of your water, your food, your hospitals, your drugs. Ten agencies. Exposed through dozens of APIs, XML feeds, CSV dumps, and legacy SOAP endpoints built in 2004.

AI agents cannot reach any of it.

Claude has no tool to call the EPA's SDWIS database. ChatGPT cannot query the FDA's adverse event reports. No agent framework ships with a connector to CMS hospital ratings or NHTSA recall data. The agents are flying blind, and they fill the void with confidence.

This is not a hallucination problem. Hallucination implies the model made something up. This is an access problem. The data exists. The model cannot get to it.

The distance between what an agent confidently says about your drinking water and what the EPA compliance record actually shows — that distance is dangerous. People make decisions in that gap. They move into apartments. They fill bottles for their kids.

## One API for 13 federal data domains

We built Open Primitive to close the gap.

Open Primitive pulls primary-source data from 10 federal agencies across 13 domains: water quality, food recalls, drug adverse events, hospital ratings, vehicle safety, airline performance, clinical trials, nursing home inspections, health supplement reports, and more.

Every domain follows the same pattern. Structured JSON. Source citations. Timestamps. Federal identifiers.

When an agent calls:

```
GET https://api.openprimitive.com/v1/water?zip=48502
```

It gets back EPA violation records for Flint. Real violations. With compliance period dates, contaminant codes, and a direct link to the SDWIS source. No summary. No interpretation. The federal record.

When an agent calls:

```
GET https://api.openprimitive.com/v1/drugs?name=aspirin
```

It gets back 601,247 adverse event reports from the FDA's FAERS database. Reported outcomes. Demographic breakdowns. The actual pharmacovigilance data that the FDA uses to issue safety signals.

The agent stops guessing. It starts citing.

## The cross-domain moment

Individual data feeds exist. Scattered, inconsistent, hard to parse — but they exist. What does not exist is the cross-domain query.

No federal agency answers this question: "How safe is this zip code?"

We do.

```
GET https://api.openprimitive.com/v1/safety?zip=48502
```

That call combines EPA water violations, CMS hospital quality ratings, and FDA food recall proximity into a composite safety score for a single zip code. Three agencies. Three databases. One response.

No federal website does this. No AI agent can do this without structured access to the underlying data. The agencies were never designed to talk to each other. We built the bridge.

A family evaluating a move to a new city gets a single score backed by 3 federal data sources. An insurance company modeling neighborhood risk gets structured JSON instead of a human Googling three websites. A local journalist investigating health disparities gets cross-referenced federal data in one API call.

## Built for machines

Here is the part that makes Open Primitive different from every other government data project.

We built the first website where AI agents are the primary audience.

Our traffic dashboard tracks what percentage of requests come from machines versus browsers. Our `robots.txt` does not say "go away." It says: this data is meant for you.

Every response includes machine-readable metadata: data freshness timestamps, source agency identifiers, confidence indicators, and suggested related queries. We designed the payload format for token efficiency — because when Claude reads our API response, every token counts against the context window.

The human-readable tools still exist. You can visit water.openprimitive.com and type in your zip code. But the human site and the API share the same data layer. Same freshness. Same sources. The human site is a reference implementation. The API is the product.

## Three protocols

We ship three ways for agents to connect:

**MCP Server.** Claude and any MCP-compatible client can discover and call Open Primitive tools natively. Ask Claude "check the water quality in my zip code" and it calls our MCP server, gets the EPA data, and responds with cited facts instead of trained guesses.

**A2A Agent Card.** Google's Agent-to-Agent protocol. Any agent framework that speaks A2A can discover Open Primitive's capabilities, negotiate the interaction, and call our endpoints without human configuration.

**REST API.** For everything else. Standard HTTP. JSON responses. API key auth. Works with curl, works with Python, works with whatever agent framework ships next month.

One data platform. Three protocols. Thirteen federal domains.

## Live now

The API is live at `api.openprimitive.com`.

Thirteen domains. Ten federal agencies. Primary-source data with citations and timestamps.

The next time you ask Claude about your water quality, it should not have to guess. The federal government already measured it. We made the measurement readable — for humans and machines both.

The data was always public. We made it usable.
