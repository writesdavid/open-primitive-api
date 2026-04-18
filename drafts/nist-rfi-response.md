# Response to NIST Request for Information Regarding Security Considerations for Artificial Intelligence Agents

**Docket Number:** NIST-2025-0035
**Federal Register Document:** 2026-00206
**Submitted by:** Open Primitive
**Website:** https://openprimitive.com | https://api.openprimitive.com
**Date:** April 2026

---

## About the Respondent

Open Primitive builds and operates open-source data infrastructure for AI agent systems. The Open Primitive API serves 30 federal data domains through a unified endpoint at api.openprimitive.com. Every response carries an Ed25519 cryptographic signature, a provenance chain, a confidence score, and regulatory compliance metadata. The system runs on Cloudflare Workers and serves agent traffic today via both REST and the Model Context Protocol (MCP) with 23 published tools.

Open Primitive addresses a specific gap in AI agent security that this RFI's questions surface repeatedly but never name directly: **the complete absence of data integrity standards for the information AI agents consume.**

---

## Question 1(a): Unique Security Threats Affecting AI Agent Systems

The most urgent security threat facing AI agent systems receives almost no attention: **unsigned, unverified data ingestion at scale.**

AI agents consume data from APIs, web services, and tool outputs. None of these sources sign their responses. None attach provenance metadata. None declare freshness, confidence, or regulatory classification. An agent cannot distinguish a legitimate FDA recall notice from a tampered one. An agent calling a weather API has no cryptographic proof that the response originated from NOAA data rather than an intercepted substitute.

Traditional software faces this problem too, but the consequences differ fundamentally. A human user reads an API response and applies judgment. An AI agent reads an API response and takes autonomous action -- the exact scope this RFI targets. An agent that books flights, moves money, or files regulatory documents based on unsigned data operates on faith, not verification.

This threat compounds in multi-agent systems (Question 1(e)). When Agent A passes data to Agent B, the provenance chain breaks entirely. Agent B cannot verify whether the data originated from a trusted source or from Agent A's hallucination. Every hop degrades integrity.

Open Primitive's response to this threat: every API response includes a signed envelope containing the raw data, a SHA-256 content hash, the upstream source URL, fetch timestamp, and an Ed25519 signature from the serving infrastructure. Agents can verify the signature. Downstream agents can pass the envelope intact, preserving the provenance chain across hops.

## Question 1(d): How These Threats Will Evolve

Data integrity threats will worsen on two axes. First, agent autonomy will increase. Agents that today require human approval for consequential actions will soon operate continuously without oversight. Unsigned data becomes more dangerous as human checkpoints disappear. Second, agent-to-agent communication will proliferate. Multi-agent orchestration systems already pass tool outputs between sub-agents with no integrity verification. As these systems grow more common, a single poisoned data source can propagate through an entire agent network.

The window for establishing data provenance standards is now, before agent architectures calcify around unsigned data flows.

## Question 2(a): Technical Controls for AI Agent System Security

Open Primitive contributes a specific agent system-level control: the **Open Primitive Protocol (OPP) envelope**. Every API response wraps data in a structured envelope containing:

- **Ed25519 signature:** Verifiable proof of origin. The signing key is published at `/.well-known/opp.json`. Any agent can verify a response was not tampered with in transit.
- **Provenance chain:** Source URL, fetch timestamp, content hash (SHA-256), and intermediate processing steps. When an agent passes data downstream, the original provenance travels with it.
- **Confidence scoring:** Multi-dimensional score computed from source reliability, data freshness, completeness, and cross-domain corroboration. An agent consuming FDA drug adverse event data receives a confidence score that reflects both the source's authority and how recently the data was fetched.
- **Compliance metadata:** Every response carries tags for EU AI Act (Article 52 transparency), NIST AI RMF (Measure function subcategories), EO 14110, and Canada AIDA. An agent operating under regulatory constraints can filter or flag responses based on compliance classification without additional processing.

This control sits at the data layer, beneath model-level and scaffold-level controls. Model robustness to prompt injection and scaffold-level monitoring both assume the data entering the system is authentic. Without data-layer integrity, those higher-level controls protect a system built on unverified inputs.

## Question 2(e): Relevant Cybersecurity Frameworks

The NIST AI Risk Management Framework (AI 100-1) and the Generative AI Profile (AI 600-1) both address data integrity in principle but lack specific guidance for agent-consumed API data. The "secure and resilient" characteristics described in the AI RMF apply directly to the data supply chain problem Open Primitive addresses.

NIST SP 800-53 Rev. 5 provides controls for information system integrity (SI family) that map well to signed data envelopes: SI-7 (Software, Firmware, and Information Integrity) and SI-10 (Information Input Validation) both describe controls that cryptographic signing of API responses would satisfy.

The missing piece: no current framework specifies how API providers serving AI agents should sign, hash, or attach provenance to their responses. NIST should consider a companion profile to SP 800-218A that addresses the data supply chain for agent systems -- not just the secure development of agents themselves, but the integrity of the data those agents consume.

## Question 3(a): Methods to Anticipate and Assess Security Threats

Open Primitive's **entity graph** provides a concrete method for detecting data integrity threats through cross-domain corroboration. The entity graph resolves entities (companies, drugs, geographic locations, facilities) across 30 federal data domains and computes corroboration scores.

Example: an agent queries drug safety data for a specific pharmaceutical. The entity graph pulls FDA adverse event reports, clinical trial data from ClinicalTrials.gov, SEC filings from the manufacturer, and CMS hospital data for facilities reporting adverse outcomes. If the drug safety data contradicts what three independent federal sources confirm, the corroboration score drops and the agent receives a signal that the data may be compromised or stale.

This cross-domain corroboration functions as a detection method for data poisoning and silent data manipulation -- two threats the RFI highlights (page 4, categories 1 and 2). A single poisoned data source is hard to detect in isolation. Cross-referencing against independent sources makes manipulation visible.

**Supply chain alignment (Question 3(a)(ii)):** Traditional software supply chain security (SBOMs, signed packages, dependency verification) has direct parallels in the data supply chain. Signed API responses function as signed packages. Provenance chains function as dependency graphs. Content hashes function as integrity checks. The conceptual framework exists. The standards for applying it to agent-consumed data do not.

## Question 3(b): Assessing a Particular AI Agent System's Security

Any security assessment of an AI agent system should include an audit of the system's data inputs. Specifically:

1. **Which APIs does the agent call?** List every external data source.
2. **Which of those APIs sign their responses?** Today, the answer for almost every agent system is: none.
3. **Can the agent verify data provenance?** Can it trace a piece of information back to its original source?
4. **Does the agent distinguish between high-confidence and low-confidence data?** Or does it treat all API responses as equally authoritative?

An agent system that calls unsigned APIs, cannot verify provenance, and treats all data as equally trustworthy has a fundamental security gap regardless of how robust its model is to prompt injection.

## Question 4(b): Modifying Environments to Mitigate Risks

Open Primitive's **temporal versioning and archive system** provides rollback capability at the data layer. Every data point served through the API receives a versioned record in persistent storage with full diff history and 730-day retention. When government data sources silently edit published data -- which happens regularly -- the archive detects and records the change.

For agent systems that take consequential actions based on federal data, this temporal archive provides the "undo" capability the RFI asks about. An agent that acted on data that was later corrected can trace back to the exact version it consumed, when it consumed it, and what changed.

## Question 4(c)(ii): Interactions with Digital Resources

The interaction between AI agents and web services represents the largest unaddressed attack surface in agent security. Agents interact with APIs using the same HTTP requests as any other client. The API has no way to know it is serving an agent. The agent has no way to verify the API's identity beyond TLS certificates, which authenticate the server but say nothing about the data's provenance or integrity.

Open Primitive addresses both sides. Agent detection middleware identifies agent traffic by user-agent patterns and request characteristics. Signed responses give agents a verification mechanism beyond TLS. The `/.well-known/opp.json` manifest publishes the signing key, supported domains, and compliance certifications, allowing agents to discover and verify data providers programmatically.

## Question 5(a): Methods to Aid Rapid Adoption of Security Practices

NIST should publish a **data provenance standard for agent-consumed APIs**. This standard should specify:

1. **A signing requirement:** API responses consumed by AI agents should carry a cryptographic signature from the data provider. Ed25519 provides a fast, compact, widely-supported option.
2. **A provenance metadata schema:** Source URL, fetch timestamp, content hash, processing chain. A standard schema allows agents to verify provenance regardless of the data provider.
3. **A confidence scoring framework:** Source reliability, freshness, completeness, corroboration. Agents need machine-readable signals about data quality, not just raw data.
4. **A compliance tagging vocabulary:** Regulatory classifications (EU AI Act, NIST AI RMF, EO 14110) attached to data at the point of origin, not bolted on downstream.

Open Primitive has built and deployed all four of these components. The protocol specification is published at openprimitive.com/spec. The system serves live traffic across 30 federal data domains. The MCP server package is published on npm. The entire system is open source.

NIST does not need to start from zero. Working infrastructure exists. The gap is standardization.

## Question 5(b): Where Government Collaboration Is Most Urgent

Federal data APIs -- the endpoints operated by FDA, EPA, NOAA, CMS, BLS, Census, NHTSA, CPSC, SEC, and others -- should lead by example. These agencies publish data that AI agents already consume for safety-critical decisions: drug recalls, food contamination alerts, vehicle defect investigations, air quality warnings, hospital safety scores.

None of these federal APIs sign their responses. None attach provenance metadata. None provide confidence scores. An AI agent consuming FDA recall data has no cryptographic proof the data came from FDA.

The most impactful action NIST can take: work with federal data providers to add signed response envelopes to existing federal APIs. This establishes a standard that private-sector API providers will follow. Open Primitive already wraps 30 of these federal data sources in signed envelopes. The federal agencies themselves should do the same at the origin.

---

## Summary

The agent security conversation focuses heavily on model-level threats: prompt injection, jailbreaking, misaligned objectives. These threats matter. But the data supply chain -- the APIs, web services, and tool outputs that agents consume -- receives almost no security attention. Agents built on unsigned, unverified data are insecure regardless of how robust the model is.

Open Primitive operates a live, open-source system that signs every API response with Ed25519, attaches provenance chains, computes confidence scores, performs cross-domain corroboration through an entity graph, and tags every response with regulatory compliance metadata. The system serves 30 federal data domains and publishes 23 MCP tools for direct agent consumption.

NIST should establish data provenance standards for agent-consumed APIs as a core component of any agent security framework. The infrastructure to do this exists today.

---

**Submitted by:** Open Primitive
**Contact:** https://openprimitive.com
**API:** https://api.openprimitive.com
**Protocol Specification:** https://openprimitive.com/spec
**MCP Package:** `npx open-primitive-mcp`
**Source:** Open source on GitHub
