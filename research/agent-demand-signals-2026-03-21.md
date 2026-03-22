# Agent Demand Signals: What Federal Data Do AI Agents Actually Need?

Research date: 2026-03-21

---

## 1. What queries hit ChatGPT that require real-time government data?

ChatGPT processes 2 billion+ daily queries. Software dev is 29% of prompts. Health/society is 15% and rising. 49% of usage is asking questions (not generating content).

The gap: ChatGPT hallucinates badly on drug data. A real-world study of 50 drug-related questions found ChatGPT answered the majority wrong or partly wrong. It identified drug-drug interaction *occurrence* at 100% accuracy but severity at only 37.3%. A pharmacist review found ChatGPT-generated medication reports were incomplete — missing drug interactions, serious side effects, contraindications, and missed dose guidance.

Nearly three-quarters of ChatGPT responses to drug-related questions were either incomplete or outright incorrect (pharmacology expert review). In one case, ChatGPT recommended substituting table salt with sodium bromide — toxic if ingested.

56.2% of GPT-4o medical citations are fabricated or contain errors.

**Bottom line:** Drug/medication data is the highest-stakes gap. Users ask these questions constantly and get wrong answers.

## 2. Government data MCP servers — what exists, what gets traction?

### Major projects found:

**us-gov-open-data-mcp** (github.com/lzinga)
- 40+ US government APIs, 250+ tools
- Treasury, FRED, Congress, FDA, CDC, FEC, lobbying
- Works with VS Code Copilot, Claude Desktop, Cursor
- 20+ APIs need no key; rest use free keys

**gov-mcp-servers** (github.com/martc03) — 13 production servers:
- cybersecurity-vuln-mcp: NIST NVD, CISA KEV, MITRE ATT&CK (7 tools)
- safety-recalls-mcp: consumer product recalls
- disasters-mcp: FEMA disasters, NOAA weather, USGS earthquakes
- federal-financial-intel-mcp: SEC EDGAR, CFPB complaints, BLS employment
- immigration-travel-mcp: visa bulletins, border wait times
- environmental-compliance-mcp: EPA air quality, HUD foreclosures
- public-health-mcp: NIH clinical trials, FDA adverse events
- regulatory-monitor-mcp: Federal Register, regulations.gov
- grant-finder-mcp: Grants.gov, USAspending
- competitive-intel-mcp: SEC filings, patent data, trade data

**datagov-mcp-server** (melaodoidao) — general Data.gov access

**opengov-mcp-server** (srobbin) — another general government data server

No npm download stats found for any of these. The MCP ecosystem is too new for reliable download metrics. The @modelcontextprotocol/server-filesystem has 31 dependents — the most of any MCP server — which gives a sense of overall ecosystem maturity (still early).

### What this tells us:
Multiple developers independently built government data MCP servers. The overlap is heavy on: FDA, CDC, FEMA, SEC, EPA, BLS. Nobody built a focused, high-quality drug interaction endpoint. Nobody built clean food recall or hospital quality endpoints. The existing servers are broad and shallow — 250 tools means none of them are good.

## 3. Perplexity and government sources

Perplexity performs best retrieving information from "clear, recent, and open-access sources like policy papers, government PDFs, or widely reported news items." 78% of complex research questions have every claim tied to a specific source.

Perplexity got FedRAMP prioritization (second AI platform after Microsoft). GSA signed a direct contract — $0.25/agency over 18 months through Multiple Award Schedule.

Perplexity for Government launched Sept 2025. Federal workers use it for policy research, regulatory compliance, and legislative tracking.

**Signal:** Government data consumers exist at scale. Perplexity's play validates the market. But Perplexity is a search wrapper — it doesn't have structured API endpoints agents can call programmatically.

## 4. What federal data does Claude Code / Cursor use?

No direct evidence of Claude Code or Cursor calling federal APIs during coding sessions. What developers need from these tools:

- NVD/CVE data for security vulnerability lookups (cybersecurity-vuln-mcp exists for this)
- Regulatory compliance references (HIPAA, FDA 21 CFR Part 11)
- License and patent data

The us-gov-open-data-mcp explicitly targets "VS Code Copilot, Claude Desktop, Cursor" — suggesting developer demand exists but is met by community MCP servers, not official tooling.

## 5. Reddit frustration signals

Specific frustration patterns from r/ChatGPT and r/ClaudeAI (synthesized from search results):

- **Medical hallucinations:** AI confidently gives wrong drug information. Users trust it because it sounds authoritative. The sodium bromide incident is the poster child.
- **Outdated data:** ChatGPT's training cutoff means it can't report current FDA recalls, active FEMA disasters, or recent drug approvals.
- **No .gov grounding:** ChatGPT doesn't reliably access .gov sources unless web browsing is explicitly enabled, and even then it doesn't prefer authoritative government sources over blog posts.
- **Privacy fears:** Users want to ask health questions but worry about data being retained.

The frustration is loudest around health data. Nobody is on Reddit complaining that ChatGPT can't tell them about federal contracts or patent filings.

## 6. Agent framework government integrations

**LangChain:** 97,000+ GitHub stars, 600+ integrations. No dedicated government data integration — users build custom tools wrapping federal APIs. The pattern is: LangChain tool → custom wrapper → openFDA/FRED/etc.

**CrewAI:** 45,900+ GitHub stars, native MCP support as of March 2026. MCP support means CrewAI agents can use any MCP server, including the government data ones above.

**Key pattern:** Both frameworks support MCP now. An Open Primitive MCP server would be immediately usable by LangChain (via MCP adapter) and CrewAI (native). No framework has built-in government data tools — they all rely on community integrations.

## 7. Top 5 "I wish my AI could check..." requests

Based on research synthesis (not a single source — triangulated from usage data, frustration signals, hallucination studies, and MCP server priorities):

1. **Drug interactions and side effects** — Highest stakes. Highest hallucination rate. Users ask constantly. ChatGPT gets it wrong >50% of the time. FDA adverse events + NLM DailyMed + RxNorm are the authoritative sources.

2. **Food safety / active recalls** — FDA recall data changes daily. AI has no way to know what's currently recalled. Parents, caregivers, and food service workers need this.

3. **Hospital and provider quality** — CMS Hospital Compare, nursing home ratings. People making care decisions. AI currently has no access to real ratings.

4. **Weather and natural disaster alerts** — NOAA, FEMA. Multiple MCP servers already cover this. High demand but also high competition (weather APIs are abundant).

5. **Flight status and travel disruption** — FAA, BTS. Multiple commercial APIs exist. Lower priority for government-data specifically because private sector covers it well.

---

## Priority Ranking for Open Primitive's 25 Endpoints

### Tier 1 — Build these first (high demand, high hallucination risk, low competition)
| Domain | Why | Source APIs |
|--------|-----|------------|
| **Drug effects / interactions** | >50% hallucination rate on drug queries. No good MCP server exists. Life-safety stakes. | openFDA adverse events, RxNorm, DailyMed |
| **Food recalls** | Changes daily. No AI can answer "is X recalled right now?" Zero competition in MCP space. | openFDA food enforcement, USDA FSIS recalls |
| **Hospital quality** | Care decisions. CMS data is public but hard to query. No MCP server covers this well. | CMS Hospital Compare, Nursing Home Compare |

### Tier 2 — Strong demand, some competition
| Domain | Why | Source APIs |
|--------|-----|------------|
| **Health supplement safety** | Adjacent to drugs. Same hallucination problem. | FDA CFSAN, NIH ODS |
| **Water safety** | Local, actionable, unique. EPA data is poorly accessible. | EPA SDWIS, state-level data |
| **Car safety / recalls** | NHTSA data. Active recalls matter for purchase decisions. | NHTSA complaints, recalls |

### Tier 3 — Valuable but competitive or niche
| Domain | Why | Source APIs |
|--------|-----|------------|
| **Flight disruption** | FAA/BTS data. But FlightAware, Flightradar24 dominate. | FAA NAS, BTS on-time |
| **Weather / disaster** | NOAA/FEMA. Multiple MCP servers already exist. | NWS API, FEMA API |
| **Economic / financial** | FRED, BLS. Well-served by existing tools. | FRED, BLS, Treasury |

### What this means for Open Primitive

Your existing tools already cover 4 of the top 6 priorities: Drugs, Food, Hospitals, Water, Cars, Health. You built the right things.

The gap: your endpoints need to be consumable by agents. That means:
- MCP server wrapper around your existing APIs
- Structured JSON responses (not HTML)
- Tool descriptions that LLMs can reason about
- Rate limiting that works for agent traffic patterns

The biggest single opportunity is **drug interactions**. It's the query where AI fails most dangerously, where users ask most frequently, and where no good agent-accessible endpoint exists.

---

## Sources

- [What the World Is Asking ChatGPT in 2025](https://www.visualcapitalist.com/what-the-world-is-asking-chatgpt-in-2025/)
- [ChatGPT Statistics 2026](https://www.incremys.com/en/resources/blog/chatgpt-statistics)
- [us-gov-open-data-mcp](https://github.com/lzinga/us-gov-open-data-mcp)
- [Building 13 MCP Servers for US Government Data](https://dev.to/martc03/building-13-mcp-servers-for-us-government-data-from-cve-lookups-to-disaster-alerts-5fch)
- [gov-mcp-servers](https://github.com/martc03/gov-mcp-servers)
- [Data.gov MCP Server](https://github.com/melaodoidao/datagov-mcp-server)
- [Perplexity for Government](https://www.perplexity.ai/hub/government)
- [GSA and Perplexity Sign First Direct to Government Deal](https://www.gsa.gov/about-us/newsroom/news-releases/gsa-perplexity-sign-first-direct-to-gov-deal-11192025)
- [Perplexity Accuracy Tests 2025](https://skywork.ai/blog/news/perplexity-accuracy-tests-2025-sources-citations/)
- [ChatGPT Hallucination Problem: 56% of References Fabricated](https://studyfinds.org/chatgpts-hallucination-problem-fabricated-references/)
- [AI Medical Misinformation](https://www.biolifehealthcenter.com/post/when-the-chatbot-is-wrong-real-world-cases-of-ai-medical-misinformation)
- [ChatGPT Drug Interaction Accuracy](https://pmc.ncbi.nlm.nih.gov/articles/PMC10105894/)
- [ChatGPT Drug Information Real-World Analysis](https://accpjournals.onlinelibrary.wiley.com/doi/10.1002/jac5.70038)
- [AI Medication Safety Monitoring](https://www.rapidinnovation.io/post/ai-agents-for-medication-safety-monitoring)
- [CrewAI vs LangChain 2026](https://www.nxcode.io/resources/news/crewai-vs-langchain-ai-agent-framework-comparison-2026)
- [Top 7 Agentic AI Frameworks 2026](https://www.alphamatch.ai/blog/top-agentic-ai-frameworks-2026)
- [Top Regulatory Intelligence MCP 2026](https://obsidianri.com/blog/top-regulatory-intelligence-mcp-2026)
- [openFDA](https://open.fda.gov/)
- [openFDA API Statistics](https://open.fda.gov/api/statistics/)
- [Data.gov](https://data.gov/)
- [FDA Project Elsa: AI Inspection Targeting](https://intuitionlabs.ai/articles/fda-project-elsa-ai-inspection-targeting)
