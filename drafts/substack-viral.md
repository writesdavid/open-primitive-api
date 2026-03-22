# The FDA Has 601,477 Adverse Event Reports for Aspirin. Your AI Guesses Instead.

My mother asked ChatGPT if she could take ibuprofen with her blood pressure medication.

The answer came back confident. Detailed. Wrong.

I caught it because I happen to know. She takes lisinopril. NSAIDs can reduce its effectiveness and raise blood pressure. The model told her it was "generally safe with medical supervision" and moved on.

She would have taken the ibuprofen. She trusts computers the way her generation trusts printed text. And the model had no idea what it didn't know.

I sat with that for a long time.

---

A study published in MedRxiv last February tested large language models against clinical case benchmarks. The hallucination rate hit 64%. Not on trick questions. On standard diagnostic scenarios that a second-year resident would recognize.

Rx-LLM, a December 2025 study focused specifically on drug interactions, found 3 in 10 queries returned incorrect information. Wrong dosages. Missed contraindications. Invented interactions that don't exist.

A JAMA survey from the same period reported 92% of clinicians had encountered AI-generated hallucinations in medical contexts. Ninety-two percent. The question wasn't whether clinicians see bad outputs. The question was how often patients see them without a clinician in the room.

My mother wasn't in a clinical setting. She was in her kitchen.

---

Here's what bothers me most. The data exists.

The FDA's Adverse Event Reporting System contains 601,477 reports for aspirin alone. Millions more across every drug on the market. Every serious side effect. Every death. Every hospitalization. Exposed in a public API that anyone can query.

No major language model queries it.

Every model guesses instead. They compress training data into statistical patterns and produce fluent, authoritative text about drugs they have never looked up. The information sits ten feet away in a federal database. The plumbing between the model and the source does not exist.

This is true across domains. The EPA publishes drinking water violations for every public system in the country. The NHTSA publishes every vehicle complaint and recall. CMS publishes quality scores for every hospital. The BLS publishes food recall enforcement actions.

The data is public. The data is structured. The data is authoritative. And the models bypass all of it to generate answers from memory.

---

I build content systems at Block. I've spent fifteen years figuring out how to make information clear and trustworthy for people who need it. Last year I started building something on the side because I couldn't stop thinking about this gap.

Open Primitive is infrastructure. Twenty-five federal data domains. An API layer that agents can query in real time. A protocol specification that defines what trust looks like when a machine is asking.

Every response is signed. Every response carries source provenance — the exact federal endpoint, the exact timestamp, the version of the dataset. Every response includes a freshness guarantee so the consuming agent knows whether the data is six minutes old or six months old.

The protocol is open. I published it because trust requires transparency. You cannot ask someone to trust a black box that calls another black box. The specification, the server, the source mappings — all public.

I built an MCP server so Claude and other models can query it directly. Ask about a drug. Get the FDA's adverse event data. Ask about your water system. Get the EPA's violation history. Ask about a hospital. Get CMS quality scores. Real data. Cited sources. No guessing.

This isn't a product. I don't sell it. I built it because the plumbing should exist and it didn't.

---

The timing matters and I want to be honest about why.

The agent internet arrives this year. Not as a concept. As deployed infrastructure. Enterprise agents ship this quarter at every major company. My employer co-founded the Agentic AI Foundation with Anthropic and OpenAI specifically to address this.

The EU AI Act's high-risk system deadline hits August 2. Medical, legal, and financial AI systems must demonstrate data provenance and accuracy by then. That's 134 days from now.

The plumbing we build in the next few months becomes the plumbing agents run on for years. Maybe decades. The defaults harden fast. If the default is "guess from training data," that default calcifies. If the default is "query the authoritative source and cite it," that calcifies too.

We get to choose. Right now. Not later.

---

I keep thinking about the end of the chain.

An enterprise deploys an agent. The agent calls a sub-agent. The sub-agent queries a model. The model generates an answer about a drug interaction, a water contaminant, a vehicle defect. Somewhere downstream, a person acts on that answer.

That person didn't choose to trust an AI. They didn't opt in. They didn't read a terms of service. The agent answered and they took the answer because it showed up where an answer was supposed to be.

My mother in her kitchen. A parent checking whether the tap water is safe for formula. A nurse at 3 AM cross-referencing a dosage. A teenager Googling whether their car's brake recall was fixed.

The least the infrastructure can do — the bare minimum — is make the agent cite a real source. Point to the actual federal record. Show the timestamp. Let the person verify if they want to.

I don't know if Open Primitive is the right shape for this. Someone smarter will probably build something better. But the gap between "the data exists" and "the model uses it" should bother more people than it currently does.

601,477 adverse event reports for aspirin. Right there. Public. Structured. Waiting.

Your model guesses instead.

---

*Open Primitive is open source. The protocol spec, MCP server, and API are at [openprimitive.com](https://openprimitive.com). I'm David Hamilton. I build content systems at Block and write here occasionally about trust, infrastructure, and the things we owe the person at the end of the chain.*
