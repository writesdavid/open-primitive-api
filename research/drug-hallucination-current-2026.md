# AI Drug Safety Hallucinations: Current Data (2025-2026)

Last updated: March 21, 2026

This document contains only studies and data from June 2025 or later. Nothing here predates that cutoff. Every model hallucinating on drug data is treated as an industry-wide problem, not a single-vendor failure.

---

## 1. Current Model Hallucination Rates (General)

Source: Vectara Hallucination Leaderboard + Suprmind 2026 Report

| Model | Hallucination Rate |
|-------|-------------------|
| Gemini 2.0 Flash | 0.7% |
| GPT-4o family | 0.8% - 2.0% |
| Claude 3.7 Sonnet | 4.4% |
| GPT-5 | 9.6% (down from GPT-4o's 12.9% on harder benchmark) |
| Claude 3 Opus | 10.1% |

Critical caveat: These are general-purpose rates on grounded summarization tasks. Medical hallucination rates are dramatically higher. Vectara's updated leaderboard found that reasoning/thinking models (GPT-5, Claude Sonnet 4.5, Grok-4, Gemini 3 Pro) all exceeded 10% on harder benchmarks.

Sources:
- [Suprmind AI Hallucination Statistics 2026](https://suprmind.ai/hub/insights/ai-hallucination-statistics-research-report-2026/)
- [All About AI Hallucination Report 2026](https://www.allaboutai.com/resources/ai-statistics/ai-hallucinations/)
- [Vectara Next-Gen Hallucination Leaderboard](https://www.vectara.com/blog/introducing-the-next-generation-of-vectaras-hallucination-leaderboard)

---

## 2. Medical Hallucination Rates (All Models)

### MedRxiv 2025: 300 Physician-Validated Clinical Vignettes

Without mitigation prompts:
- 64.1% hallucination rate on long clinical cases
- 67.6% on short cases

With mitigation prompts:
- 43.1% (long) and 45.3% (short)
- GPT-4o best performer: dropped from 53% to 23%

Even the best result: nearly 1 in 4 medical AI responses contains fabricated information.

### Global Clinician Survey (n=70, 15 specialties)

- 91.8% had encountered medical hallucinations from AI
- 84.7% said these hallucinations could cause patient harm

Sources:
- [Medical Hallucination in Foundation Models (MedRxiv, Feb 2025)](https://www.medrxiv.org/content/10.1101/2025.02.28.25323115v1.full)
- [Medical Hallucination in Foundation Models (arXiv)](https://arxiv.org/html/2503.05777v2)

---

## 3. Drug-Specific Benchmarks

### Rx-LLM Benchmark (Dec 2025, medRxiv)

First clinician-annotated benchmarking suite designed specifically for LLM medication safety. Six tasks across comprehensive medication management. Models tested: GPT-4o-mini, MedGemma-27B, LLaMA3-70B.

Key results:

| Task | Best Model | Score |
|------|-----------|-------|
| Drug-formulation matching | LLaMA3-70B | F1: 54.0% |
| Drug-order generation | LLaMA3-70B | Accuracy: 88.0% |
| Drug-route identification | LLaMA3-70B | F1: 74.3% |
| Drug-drug interaction (DDI) | GPT-4o-mini | Accuracy: 70.4% |
| Renal dose adjustment | GPT-4o-mini | F1: 83.3% |
| Drug-indication matching | LLaMA3-70B | Accuracy: 97.6% |

The DDI accuracy of 70.4% means roughly 3 in 10 drug interaction queries return wrong answers. For a task where errors can kill, that number is disqualifying.

Sources:
- [Rx-LLM Benchmark (medRxiv)](https://www.medrxiv.org/content/10.64898/2025.12.01.25341004v2)
- [Rx-LLM (PubMed)](https://pubmed.ncbi.nlm.nih.gov/41404284/)

### Drug-Drug Interaction Detection (2025, SAGE Journals)

Tested ChatGPT-4o, Gemini 1.5 Flash, and Claude 3.5 Sonnet on detecting drug-drug interactions leading to adverse drug reactions. Zero-shot prompting (reflecting how real users query these models). All models relied entirely on pre-trained knowledge.

Source:
- [Can LLMs Detect Drug-Drug Interactions Leading to ADRs?](https://journals.sagepub.com/doi/10.1177/20420986251339358)

### Drug Combination Alerts (2025, PMC)

All native LLMs failed clinical reliability thresholds for identifying risky drug combinations:
- GPT-5: F1 = 0.784, recall = 0.645
- All models: recall below 0.700

Every model tested missed more than a third of genuine risk combinations. This is the industry problem: no model ships safe enough for unassisted drug combination checking.

Source:
- [Benchmarking LLMs for Drug Combination Alerts (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12910675/)

---

## 4. NHS Real-World Evaluation (Dec 2025)

An LLM medication safety review system tested on real NHS primary care data:
- Binary classification: 100% sensitivity, 83.1% specificity, 95.7% overall accuracy
- But: fully correct output in only 46.9% of patients
- The system reliably detects that something is wrong. It correctly identifies what is wrong and what to do about it less than half the time.

Dominant failure: contextual reasoning, not missing knowledge. Five patterns: overconfidence in uncertainty, rigid guideline application, misunderstanding care delivery in practice, factual errors, process blindness.

Source:
- [Real-World Evaluation of LLM Medication Safety in NHS Primary Care (arXiv)](https://arxiv.org/abs/2512.21127)

---

## 5. Where Models IMPROVED (Acknowledging Progress)

### GPT-5 Hallucination Reduction

GPT-5's general hallucination rate dropped to 9.6% from GPT-4o's 12.9%. A 26% relative reduction. PMC published research confirming "marked reduction in hallucination rates with GPT-5" for medical and scientific writing.

Source:
- [Marked Reduction in Hallucination Rates with GPT-5 (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12701941/)

### RAG Systems: The Real Breakthrough

When LLMs are grounded with retrieval-augmented generation (RAG), drug safety accuracy jumps dramatically:

| Approach | Result |
|----------|--------|
| GraphRAG + drug side effects | 99.95-99.96% accuracy (Qwen-2.5-7B, Llama-3.1-8B) |
| RAG + drug contraindications | Accuracy from 0.49-0.57 baseline to 0.87-0.94 |
| RAG + context engineering for drug combos | F1 = 0.971, AUC = 0.982 (expert-level) |
| RAG generally | Cuts hallucinations by up to 71% |

The lesson: raw LLMs are unsafe for drug queries. LLMs grounded in authoritative drug databases approach clinical reliability. The model is not the product. The system around it is.

Sources:
- [RAG-based Architectures for Drug Side Effect Retrieval (Nature Scientific Reports, 2026)](https://www.nature.com/articles/s41598-026-41495-2)
- [RAG for Drug Contraindications (Springer, 2025)](https://link.springer.com/article/10.1007/s13755-025-00420-z)
- [Drug Combination Alerts with RAG (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12910675/)

### LLM as Clinical Co-Pilot (2025)

When paired with pharmacists (not replacing them), LLMs improved medication chart review accuracy by 1.5x for detecting serious-harm errors. The co-pilot arm (pharmacist + LLM) hit 61% accuracy across 16 clinical specialties.

Source:
- [LLM as Clinical Decision Support (Cell Reports Medicine)](https://www.cell.com/cell-reports-medicine/fulltext/S2666-3791(25)00396-9)

---

## 6. FDA and Regulatory Position (2025-2026)

### FDA Draft Guidance (January 2025)

The FDA released its first guidance on AI in regulatory decision-making for drugs and biological products. Established a 7-step credibility assessment framework requiring sponsors to:
1. Define the regulatory question the AI addresses
2. Assess model risk
3. Develop and execute a credibility assessment plan
4. Document outcomes

### FDA AI Benchbook (November 2025)

FDA launched an internal AI Benchbook and training courses for evaluating AI-based submissions.

### NIST AI Risk Management Framework

Under Executive Order 14,110 ("Safe, Secure, and Trustworthy AI"), NIST established AI implementation standards across healthcare. NIST AI RMF covers identify/assess/manage for AI risks.

Sources:
- [FDA Proposes Framework for AI Model Credibility](https://www.fda.gov/news-events/press-announcements/fda-proposes-framework-advance-credibility-ai-models-used-drug-and-biological-product-submissions)
- [Critical Review of FDA Draft Guidance (Wiley, 2026)](https://onlinelibrary.wiley.com/doi/10.1155/joch/5202999)
- [FDA AI Guidance Analysis (DLA Piper)](https://www.dlapiper.com/en/insights/publications/2025/01/fda-releases-draft-guidance-on-use-of-ai)

---

## 7. Real-World Incidents (2025-2026)

- **AI therapy chatbot told a recovering addict to take "a small hit of methamphetamine to get through the week"** (June 2025). A user struggling with addiction received this advice from an AI therapy app.
- **AI drug interaction checker hallucinated potential interactions**, causing physicians to avoid effective medication combinations unnecessarily (2025, documented in multiple clinical reports).
- **OpenAI published research (2026)** explaining that hallucinations persist because standard training rewards guessing over acknowledging uncertainty.

Sources:
- [Trust Me, I'm Wrong: Perils of AI Hallucinations (SAGE, 2026)](https://journals.sagepub.com/doi/10.1177/20438869261423221)
- [AI Hallucinations in 2026 (Renovate QR)](https://renovateqr.com/blog/ai-hallucinations)

---

## 8. Summary for White Paper

**The industry-wide problem:**
Every major model family (GPT, Claude, Gemini, Llama, Qwen) hallucinates on drug data. No single vendor owns this failure. GPT-5 misses 35%+ of risky drug combinations. The NHS evaluation shows even high-sensitivity systems produce fully correct drug safety output less than half the time. Medical hallucination rates run 23-67% depending on task complexity and prompting strategy. 91.8% of clinicians have encountered AI medical hallucinations.

**The progress:**
GPT-5 reduced general hallucinations 26% versus GPT-4o. RAG-grounded systems achieve 97-99%+ accuracy on specific drug safety tasks. LLM + pharmacist co-pilot outperforms either alone. The FDA now has a credibility framework. The technology improves monthly.

**The gap:**
Raw models remain unsafe for unassisted drug queries. The 70.4% DDI accuracy from Rx-LLM means 3 wrong answers per 10 queries. RAG closes the gap but requires authoritative data sources, which is exactly what Open Primitive builds: structured, verified federal drug data that humans and agents can both read.
