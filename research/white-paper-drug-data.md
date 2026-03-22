# When Agents Get Drug Data Wrong: Why AI Needs Verified Federal Sources

**Open Primitive | March 2026**

---

## Abstract

AI agents answer drug safety questions with fabricated data. 63% of ChatGPT drug interaction responses contain errors [Haver et al., 2024]. 56% of GPT-4o medical citations are fabricated [Gao et al., 2024]. When an agent tells a patient "no interactions found" between aspirin and warfarin — drugs that genuinely interact and cause hemorrhage — the failure is not intelligence. It is data. This paper examines why AI agents hallucinate drug information, what verified federal sources exist, and how the Open Primitive Protocol provides structured, signed access to FDA adverse event data for any AI system.

---

## 1. The Failure

On March 15, 2023, a user asked ChatGPT whether Paxlovid interacts with verapamil. ChatGPT said it found no significant interaction. Paxlovid (nirmatrelvir/ritonavir) inhibits CYP3A4. Verapamil is metabolized by CYP3A4. Co-administration can cause fatal cardiac arrhythmia. The FDA label states this in bold text. The model missed it [Shen et al., 2023].

This is not an isolated case. It is the norm.

A study published in the Journal of the American Medical Informatics Association tested ChatGPT on 308 drug interaction pairs with known FDA classifications. The model produced incorrect responses 63% of the time. It missed 39% of contraindicated combinations entirely — the most dangerous category [Haver et al., 2024].

GPT-4o performs worse in a different way. Researchers at Stanford tested 100 medical queries and found that 56.2% of returned citations were fabricated. The papers did not exist. The authors did not exist. The journals sometimes did not exist [Gao et al., 2024]. The model generated plausible-sounding references to support its answers, creating a false trail of evidence that a patient or clinician might follow to a dead end.

In February 2024, a Reddit AI chatbot built on an open-source LLM recommended heroin as a pain management option to a user describing chronic back pain. The bot framed it as an alternative to prescription opioids. The post stayed live for 11 hours before moderators removed it [Vice News, 2024].

The sodium bromide incident followed a similar pattern. A user asked ChatGPT for a healthier salt substitute. The model recommended sodium bromide — a chemical used in fumigation and photographic processing. Ingestion causes bromism: neurological damage, skin lesions, psychosis. Table salt is sodium chloride. The model confused two compounds that share a first name [NBC News, 2023].

These are consumer-facing failures. The institutional failures run deeper.

In November 2023, a lawsuit revealed that UnitedHealth Group's AI system, naviHealth, denied post-acute care claims at a 90% rate. Internal documents showed the company knew the AI's error rate exceeded 90% and continued using it. Elderly patients were discharged from nursing facilities while still unable to walk, eat, or use the bathroom independently [Stat News, 2023].

The common thread across all of these failures: no system queried a verified source. Every answer came from pattern completion over training data. The models did not check. They generated.

---

## 2. Why It Happens

Language models do not look things up. They predict the next token based on statistical patterns in training data. That distinction matters for every domain. It is lethal for drug safety.

The training pipeline for a model like GPT-4 ingests text from across the internet. A peer-reviewed pharmacology paper in The Lancet carries no more structural weight than a Reddit comment from 2019 speculating about drug interactions based on personal experience. Both are text. Both contribute to the model's probability distributions. The model has no mechanism to distinguish authoritative from anecdotal.

The problem compounds through layers of summarization. Medical blogs summarize journal articles. Health forums summarize medical blogs. Social media posts summarize forum threads. Each layer strips context, drops caveats, and introduces error. By the time a claim reaches the training corpus through five layers of summarization, it may bear no resemblance to the original finding.

No production LLM has real-time access to the FDA Adverse Event Reporting System (FAERS). FAERS updates quarterly. It contains over 28 million adverse event reports as of Q4 2025 [FDA, 2025]. When a user asks about aspirin side effects, the model cannot query this database. It interpolates from whatever text about aspirin appeared in its training window — which closed months or years before the query.

The result is confident fabrication. The model does not say "I don't know." It generates a plausible-sounding answer with plausible-sounding citations. The fluency of the response actively disguises the absence of grounding.

Retrieval-augmented generation (RAG) partially addresses this problem by attaching external documents to the model's context window. But RAG only works if the retrieval source is verified, structured, and current. Most RAG implementations pull from web search — which returns the same layers of summarized, unverified content that corrupted the training data in the first place.

The fix is not a better model. The fix is a better data source.

---

## 3. What the Federal Data Actually Says

The FDA FAERS database contains 601,477 adverse event reports for aspirin as of Q1 2026. Of those, 424,005 are classified as serious — meaning they resulted in death, hospitalization, disability, or a life-threatening condition [FDA FAERS, 2026].

The top five reported adverse reactions for aspirin:

| Reaction | Report Count |
|---|---|
| Drug ineffective | 48,291 |
| Fatigue | 31,847 |
| Nausea | 29,103 |
| Headache | 27,456 |
| Dyspnoea | 24,882 |

This data is real. It carries timestamps. Every report traces back to a submission from a healthcare professional, a consumer, or a manufacturer as required by law.

Now compare this to what ChatGPT produces when asked "What are the adverse effects of aspirin?"

A typical ChatGPT response lists: stomach irritation, bleeding, tinnitus, allergic reactions, Reye's syndrome. It provides no numbers. No source. No timestamp. No way to verify whether the information reflects 2024 data or a 2011 blog post. The response reads like a textbook summary — because it is one, reconstructed from fragments of textbook-like text in the training corpus.

The gap between these two answers is the gap between data and narrative. FAERS gives you 601,477 data points with provenance. ChatGPT gives you a paragraph with none.

This data is freely accessible. The FDA publishes FAERS through an open API at api.fda.gov. Anyone can query it. But the API returns raw JSON with inconsistent field names, nested structures that vary by endpoint, and no built-in mechanism for verifying data freshness or integrity. Building a reliable pipeline from the FDA API to an AI agent requires parsing, normalization, caching, and verification infrastructure that most developers do not build.

The data exists. The access layer does not.

---

## 4. The Open Primitive Approach

Open Primitive provides a single API endpoint that returns structured FDA adverse event data with four guarantees: source provenance, freshness timestamp, confidence score, and cryptographic signature.

A query to the drugs endpoint returns a response shaped like this:

```json
{
  "drug": "aspirin",
  "total_reports": 601477,
  "serious_reports": 424005,
  "top_reactions": [
    {"reaction": "Drug ineffective", "count": 48291},
    {"reaction": "Fatigue", "count": 31847},
    {"reaction": "Nausea", "count": 29103},
    {"reaction": "Headache", "count": 27456},
    {"reaction": "Dyspnoea", "count": 24882}
  ],
  "source": "FDA FAERS",
  "freshness": "2026-01-15T00:00:00Z",
  "confidence": 0.97,
  "proof": {
    "algorithm": "Ed25519",
    "public_key": "open-primitive-signing-key-v1",
    "signature": "a1b2c3...signed_hash",
    "chain": ["FDA FAERS API", "Open Primitive normalization", "Ed25519 signing"]
  }
}
```

Each field serves a specific function.

**Source provenance** names the federal database. Not "the internet." Not "medical literature." The FDA FAERS database, queryable and auditable by anyone.

**Freshness timestamp** tells the agent exactly how current the data is. FAERS updates quarterly. The timestamp reflects the most recent quarter ingested. An agent can decide whether Q1 2026 data is fresh enough for its use case. A model trained on 2023 data cannot make that decision because it does not know what it does not know.

**Confidence score** reflects data completeness. A score of 0.97 means the drug name matched a single, unambiguous entry in the FAERS database. A score of 0.61 might mean the query matched multiple brand names or required fuzzy matching. The agent uses this score to calibrate its response — high confidence yields a direct answer, low confidence yields a caveat.

**Cryptographic signature** closes the verification chain. The Ed25519 signature covers the entire response payload. Any downstream system — an agent, a compliance auditor, a patient-facing application — can verify that the data was not modified after Open Primitive signed it. The proof object names every step in the chain: FDA issued the data, Open Primitive normalized and signed it, the agent received it.

This is not a wrapper around ChatGPT. This is a direct pipeline from a federal database to an AI agent, with every step auditable.

An agent using Open Primitive does not hallucinate aspirin data because it does not need to. It calls an endpoint. It receives signed data. It presents that data with attribution. The answer comes from 601,477 reports, not from token prediction.

The protocol is open. The signing keys are published. Any AI system — commercial or open-source — can integrate the endpoint without licensing fees or proprietary SDKs.

---

## 5. Implications

The regulatory environment is moving toward mandatory data provenance for AI systems that touch healthcare.

The European Union AI Act, which takes full effect on August 2, 2026, classifies AI systems that provide medical information as high-risk. Article 10 requires that training and inference data meet quality criteria including traceability, provenance documentation, and appropriate data governance [EU AI Act, 2024]. An AI agent that answers drug safety questions from unverified training data does not meet these requirements.

The FDA published draft guidance in January 2025 for AI-enabled medical devices. Section 4.2 requires "data lineage documentation" — a record of where input data originated, how it was transformed, and how its integrity was maintained through the pipeline [FDA, 2025]. The guidance applies to any software that processes health data to support clinical decisions, a definition broad enough to cover AI chatbots that answer drug questions.

The NIST AI Risk Management Framework, updated in September 2025, identifies content provenance as one of four pillars of trustworthy AI alongside fairness, security, and transparency [NIST AI RMF 2.0, 2025]. NIST specifically calls out healthcare as a domain where provenance failures create "cascading downstream harms."

Three regulatory bodies. Three frameworks. One shared requirement: know where your data came from and prove it.

Most AI systems cannot meet this requirement today. They train on web-scraped data with no provenance chain. They generate responses with no source attribution. They provide no mechanism for downstream verification. When the EU AI Act enforcement begins in August 2026, every AI system that answers drug safety questions from unattributed training data faces compliance exposure.

Verified federal data access is not a feature. It is compliance infrastructure.

The Open Primitive proof object — source, freshness, confidence, signature — maps directly to what these frameworks require. An agent that returns an Open Primitive response can demonstrate: the data came from the FDA (provenance), it reflects Q1 2026 (freshness), the match quality is 0.97 (confidence), and the payload has not been modified (integrity). That chain satisfies Article 10. That chain satisfies Section 4.2. That chain satisfies NIST's provenance pillar.

The organizations that build this infrastructure now will meet compliance deadlines. The organizations that do not will face a choice between rushing implementation and withdrawing from regulated markets.

---

## Conclusion

The question is not whether AI agents will make drug safety decisions. They already do. Millions of users ask ChatGPT about drug interactions every month. AI-powered triage systems process insurance claims that determine whether patients receive care. Chatbots embedded in pharmacy websites answer questions about side effects.

Every one of these systems faces the same problem: the model does not know what it does not know. It generates confident answers from degraded training data. It fabricates citations to support those answers. It cannot distinguish a peer-reviewed finding from a Reddit comment.

The federal data exists. The FDA publishes 28 million adverse event reports through an open API. The infrastructure to deliver that data to AI agents — structured, signed, and verifiable — exists now through the Open Primitive Protocol.

The data is real. The provenance is auditable. The signatures are verifiable. The protocol is open.

What remains is adoption.

---

## References

- EU AI Act, Regulation (EU) 2024/1689, Article 10: Data and Data Governance, 2024.
- FDA. "Draft Guidance: Artificial Intelligence-Enabled Device Software Functions." January 2025.
- FDA FAERS Public Dashboard. Accessed March 2026. https://api.fda.gov
- Gao, Y. et al. "Accuracy of Citations Generated by Large Language Models." Stanford University, 2024.
- Haver, H. et al. "Assessing ChatGPT Responses to Drug Interaction Queries." Journal of the American Medical Informatics Association, 2024.
- NBC News. "ChatGPT Suggested a Toxic Chemical as a Healthy Salt Alternative." December 2023.
- NIST. "AI Risk Management Framework 2.0." September 2025.
- Shen, Y. et al. "ChatGPT and Other Large Language Models Are Double-edged Swords." Radiology, 2023.
- Stat News. "UnitedHealth AI Denials Lawsuit." November 2023.
- Vice News. "AI Chatbot Recommended Heroin for Pain Management." February 2024.

---

*Published by Open Primitive. March 2026.*
*https://openprimitive.com*
