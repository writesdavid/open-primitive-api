# Open Primitive Protocol — 30-Day Launch Playbook

Last updated: 2026-03-20

## Constraint

David does not appear. No podcasts, no talks, no press, no bylined posts. Everything ships from "Open Primitive" or anonymous accounts.

## Platform Identity Rules

| Platform | Org/project account allowed? | Notes |
|----------|------------------------------|-------|
| GitHub | Yes | writesdavid org or repo — no personal bio needed |
| npm | Yes | Package published as open-primitive-mcp, author field is project name |
| Dev.to | No — accounts are personal | Create account as "Open Primitive" with project avatar. Dev.to does not verify identity. Display name = "Open Primitive" |
| Hacker News | No — accounts are personal | Create a throwaway or use existing. HN has no org accounts. Posts are judged on content, not identity. Usernames are low-visibility |
| Twitter/X | Yes | Create @openprimitive (or similar). Org accounts exist but cost money. A standard account named "Open Primitive" works fine |
| mcp.so | Yes | Submission is project-based, no personal identity required |
| Smithery | Yes | Published under repo URL, not personal name |
| Glama | Yes | GitHub OAuth links to repo, not personal brand |
| Reddit | No — accounts are personal | Create u/openprimitive or similar. Reddit has no org accounts |
| Discord | Yes | Bot/project identity in any server |

---

## Pre-Launch Checklist (Do Before Day 1)

- [ ] Create Twitter/X account: display name "Open Primitive", handle @openprimitive or @openprimitiveio
- [ ] Create Dev.to account: display name "Open Primitive", avatar = project logo
- [ ] Create Reddit account: u/openprimitive or similar
- [ ] Create HN account (if no existing throwaway): any neutral username
- [ ] Fix npm mcpName field and republish open-primitive-mcp@1.0.1
- [ ] Verify api.openprimitive.com returns valid OPP envelope on all 16 domains
- [ ] Verify `npx -y open-primitive-mcp` works from a clean machine

---

## Week 1: Foundation (Days 1-7)

### Day 1 — Publish to Smithery

**Action:** Run the Smithery publish command.

```bash
npx smithery mcp publish "https://github.com/writesdavid/open-primitive-api" -n writesdavid/open-primitive-mcp
```

If CLI fails, submit via https://smithery.ai web UI.

**Identity:** Project. No personal name exposed.
**Expected result:** Listed on Smithery within 24 hours. 50-100 impressions first week.

---

### Day 2 — Submit to Glama

**Action:** Go to https://glama.ai/mcp/servers/submit. Enter `https://github.com/writesdavid/open-primitive-api`. Claim via GitHub OAuth. Copy the badge URL and add it to the repo README.

**Identity:** GitHub OAuth — links to repo, not personal brand.
**Expected result:** Indexed on Glama. Badge live in README. Needed before awesome-mcp-servers PR.

---

### Day 3 — Submit to mcp.so

**Action:** Go to https://mcp.so/submit. Paste the content from `/Users/hamiltons/open-primitive-api/drafts/mcp-so-submission.md`.

**Identity:** Project. mcp.so submissions are project-based.
**Expected result:** Listed within 1-3 days. mcp.so is the most-visited MCP directory. 200-500 impressions first week.

---

### Day 4 — PR to awesome-mcp-servers

**Action:**

```bash
gh repo fork punkpeye/awesome-mcp-servers --clone
cd awesome-mcp-servers
git checkout -b add-open-primitive
```

Add the line from `/Users/hamiltons/open-primitive-api/drafts/awesome-mcp-servers-pr.md` to the Data & Databases section (alphabetical order). Include the Glama badge. Open PR.

**Identity:** GitHub account. PR content is project-focused. Reviewer sees writesdavid username but the PR itself is about the project.
**Flag:** GitHub username is visible. This is unavoidable for any GitHub PR. Low risk — MCP repo PRs are routine.
**Expected result:** PR reviewed within 1-2 weeks. Once merged: 500-2,000 impressions/week from the repo's traffic. This is the single highest-leverage registry action.

---

### Day 5 — PR to modelcontextprotocol/servers (official registry)

**Action:** Follow the steps in `/Users/hamiltons/open-primitive-api/drafts/registry-and-platforms.md` under "Official MCP Registry." Fork, branch, add line, PR.

**Identity:** GitHub account (same flag as Day 4).
**Expected result:** Anthropic team reviews. If merged, this is the canonical MCP server list. 1,000+ weekly impressions. Merge timeline: 1-4 weeks.

---

### Day 6 — Publish Dev.to tutorial

**Action:** Log into Dev.to as "Open Primitive." Create new post. Paste content from `/Users/hamiltons/open-primitive-api/drafts/devto-tutorial.md`. Set tags: `ai, agents, protocol, api`. Publish.

**Identity:** "Open Primitive" Dev.to account. No personal name.
**Expected result:** 500-2,000 views first week. Dev.to has strong SEO — this will rank for "MCP server federal data" searches within days.

---

### Day 7 — Rest. Monitor registries.

**Action:** Check Smithery, Glama, mcp.so for listing status. Check awesome-mcp-servers PR for reviewer comments. Fix anything broken.

**Identity:** N/A.
**Expected result:** All three directories confirmed live. Any PR feedback addressed.

---

## Week 2: Distribution (Days 8-14)

### Day 8 — Post Show HN

**Action:** Go to https://news.ycombinator.com/submit.

- Title: `Show HN: Open Primitive Protocol – a response envelope standard for AI agents`
- URL: `https://api.openprimitive.com`

Immediately post the comment from `/Users/hamiltons/open-primitive-api/drafts/show-hn.md`.

**Identity:** HN username visible. HN culture values substance over identity. Low risk.
**Flag:** Personal HN account required.
**Expected result:** 20-100 upvotes if it hits the front page. 2,000-10,000 views. HN is high variance — could be 5 upvotes or 500. The comment quality determines trajectory.
**Timing:** Post between 8-10am ET on a Tuesday or Wednesday for maximum visibility.

---

### Day 9 — Post Twitter/X launch thread

**Action:** Log into @openprimitive. Post the 10-tweet thread from `/Users/hamiltons/open-primitive-api/drafts/twitter-launch.md`. Post each tweet as a reply to the previous one.

**Identity:** @openprimitive account. No personal name.
**Expected result:** New account, so organic reach will be low: 100-500 impressions. The thread exists primarily as a shareable artifact for other channels.

---

### Day 10 — Post to r/MachineLearning

**Action:** Go to https://reddit.com/r/MachineLearning. Create a post with flair `[Project]`.

Title: `[P] Open Primitive Protocol — a signed envelope standard for AI agent data consumption`

Body: Condense the Show HN comment to 3 paragraphs. Link to api.openprimitive.com and the protocol spec.

**Identity:** Reddit account. Use u/openprimitive.
**Expected result:** 50-200 upvotes. r/MachineLearning has 3M+ members. The [P] flair is specifically for project announcements.

---

### Day 11 — Post to r/artificial

**Action:** https://reddit.com/r/artificial. Similar post, shorter. Focus on "agents trust data blindly, this fixes that."

**Identity:** Same Reddit account.
**Expected result:** 20-80 upvotes. Smaller but more discussion-oriented than r/MachineLearning.

---

### Day 12 — Post to r/LocalLLaMA

**Action:** https://reddit.com/r/LocalLLaMA. Frame around MCP: "Built an MCP server with 16 federal data tools. Every response is cryptographically signed. Works with Claude, compatible with any MCP client."

**Identity:** Same Reddit account.
**Expected result:** 30-100 upvotes. r/LocalLLaMA audience runs their own setups and will actually try `npx open-primitive-mcp`.

---

### Day 13 — Post to r/ChatGPT and r/ClaudeAI

**Action:** Two posts. Frame for each audience:

- r/ClaudeAI: "Built an MCP server that gives Claude access to 16 federal databases — water safety, drug interactions, hospital ratings, and more. `npx open-primitive-mcp` in your Claude Desktop config."
- r/ChatGPT: "Open Primitive Protocol — a data envelope standard for AI agents. REST API at api.openprimitive.com. Works with any agent framework."

**Identity:** Same Reddit account.
**Expected result:** 20-50 upvotes each. These audiences are end-users, not developers. Lower engagement but broader reach.

---

### Day 14 — npm README optimization

**Action:** Update the npm package README to include: Glama badge, Smithery link, mcp.so link, Dev.to tutorial link. Republish as 1.0.2 (patch bump for README only).

**Identity:** npm publish under project name.
**Expected result:** Anyone who finds the package via npm search sees the full ecosystem of listings. Compounds all previous actions.

---

## Week 3: Community (Days 15-21)

### Day 15 — Open GitHub Discussions on the repo

**Action:** Enable GitHub Discussions on writesdavid/open-primitive-api. Create three seed discussions:

1. "What federal data domains should we add next?" (category: Ideas)
2. "OPP envelope format feedback" (category: General)
3. "Who's using OPP in production?" (category: Show and Tell)

**Identity:** GitHub account. Project-focused.
**Expected result:** Creates a home for community feedback. Required before asking people to contribute.

---

### Day 16 — File an issue on Claude Desktop / MCP client repos

**Action:** Open an issue or discussion on https://github.com/modelcontextprotocol/typescript-sdk (or the relevant MCP client repos) suggesting OPP envelope support. Frame as: "Agents that speak MCP get data with no provenance metadata. Here's a standard envelope that fixes that."

Link to the protocol spec.

**Identity:** GitHub account.
**Flag:** GitHub username visible. But this is a protocol proposal, not self-promotion.
**Expected result:** Gets OPP on the radar of MCP framework maintainers. Even if rejected, the discussion is indexed and findable.

---

### Day 17 — Post to Anthropic Discord #mcp-showcase

**Action:** Join the Anthropic Discord (https://discord.gg/anthropic). Post in #mcp-showcase or equivalent channel:

"Open Primitive MCP — 16 US federal data domains as tools. Water safety, drug interactions, hospital ratings, vehicle defects, and more. Every response cryptographically signed. `npx -y open-primitive-mcp` to try it."

**Identity:** Discord username. Can use "Open Primitive" as display name.
**Expected result:** 50-200 views. Anthropic Discord has active MCP users who will test it.

---

### Day 18 — Post to AI/MCP Discord servers

**Action:** Find and post in these Discord servers (search https://discord.com/servers for "MCP" or "AI agents"):

- LangChain Discord — #showcase or #general
- CrewAI Discord — #showcase
- AutoGPT Discord — #projects

Same message format as Day 17, adapted to each community's framework.

**Identity:** Project display name on each server.
**Expected result:** 20-50 views per server. Low volume but high-intent audience.

---

### Day 19 — Cross-post Dev.to tutorial to Hashnode

**Action:** Create Hashnode account as "Open Primitive" at https://hashnode.com. Republish the Dev.to tutorial with canonical URL pointing to Dev.to version (prevents SEO penalties).

**Identity:** "Open Primitive" Hashnode account.
**Expected result:** 200-500 additional views. Hashnode has developer-heavy readership and good SEO.

---

### Day 20 — Submit to Product Hunt (prep)

**Action:** Go to https://producthunt.com. Create a maker account as "Open Primitive." Draft the launch but do not publish yet. Prepare:

- Tagline: "Signed data envelopes for AI agents. 16 federal domains. One protocol."
- Description: 3 paragraphs from the Show HN post.
- Images: Screenshot of an OPP envelope response. Screenshot of Claude using the MCP tools.
- Link: https://api.openprimitive.com
- Topics: Artificial Intelligence, Developer Tools, Open Source

**Identity:** "Open Primitive" maker profile.
**Expected result:** Draft ready for Day 22 launch.

---

### Day 21 — Write a second Dev.to post

**Action:** Write and publish on Dev.to (as "Open Primitive"):

Title: "What happens when Claude reads federal data through a signed protocol"

Use the draft at `/Users/hamiltons/open-primitive-api/drafts/blog-what-happens-when-claude.md` as the base. Show real examples: Claude querying water safety for Flint, MI. Claude cross-referencing hospital ratings with drug adverse events. The signed envelope in full.

**Identity:** "Open Primitive" Dev.to account.
**Expected result:** 300-1,000 views. Practical demonstration content converts better than spec explanations.

---

## Week 4: Amplification (Days 22-30)

### Day 22 — Launch on Product Hunt

**Action:** Publish the Product Hunt listing prepared on Day 20. Schedule for 12:01am PT (Product Hunt resets daily at midnight PT — early launches get more runway).

Post the link to Twitter/X @openprimitive and all Reddit communities from Week 2 (as comments in original threads, not new posts).

**Identity:** "Open Primitive" Product Hunt maker.
**Expected result:** 50-200 upvotes. Product Hunt audience skews toward early adopters. 1,000-5,000 views on launch day.

---

### Day 23 — Engage Product Hunt comments

**Action:** Respond to every Product Hunt comment within 4 hours. Answer technical questions with specific details (endpoint URLs, envelope fields, npm command).

**Identity:** "Open Primitive" maker account.
**Expected result:** Engagement rate determines Product Hunt ranking. Active response = higher placement.

---

### Day 24 — Post to Lobste.rs

**Action:** Lobste.rs requires an invite. If you have one, post:

- URL: https://lobste.rs/stories/new
- Title: "Open Primitive Protocol: signed data envelopes for AI agents"
- URL: https://openprimitive.com/protocol.html
- Tags: ai, distributed

If no invite: skip. Do not cold-email for invites — it violates community norms.

**Identity:** Lobste.rs uses real names by convention. **Flag: requires personal identity.** Skip if the real-name norm is a dealbreaker.
**Expected result:** 20-50 upvotes. Lobste.rs audience is small but deeply technical. High-quality feedback.

---

### Day 25 — Submit protocol spec to IETF/W3C community groups (optional)

**Action:** Post to the W3C Community Group for Credentials (https://www.w3.org/community/credentials/) or relevant AI standards group. Frame OPP as a draft proposal for agent data provenance.

Alternatively, post to https://github.com/anthropics/anthropic-cookbook or similar community repos as an example.

**Identity:** Project-based submission.
**Expected result:** Long-term credibility signal. Standards bodies move slowly. This plants a flag.

---

### Day 26 — GitHub repo SEO pass

**Action:** Update the GitHub repo:

- Add all topic tags: `mcp`, `mcp-server`, `ai-agents`, `federal-data`, `protocol`, `data-provenance`, `open-source`, `vercel`, `nodejs`
- Update repo description to: "Open Primitive Protocol — signed data envelopes for AI agents. 16 US federal data domains. MCP + A2A + REST."
- Pin the repo on the writesdavid GitHub profile (or create an org and transfer)

**Identity:** GitHub account.
**Expected result:** GitHub search ranking improves. Anyone searching "mcp server federal data" finds this.

---

### Day 27 — Repost Twitter/X thread with results

**Action:** Post a follow-up thread on @openprimitive with actual numbers:

"Week 3 of Open Primitive Protocol. [X] npm installs. [Y] API calls. [Z] unique agents querying federal data. Here's what we learned."

Include one specific example of an agent using OPP in an unexpected way (pull from API logs).

**Identity:** @openprimitive.
**Expected result:** 200-1,000 impressions. Real numbers perform better than launch hype.

---

### Day 28 — Email MCP newsletter / blog editors

**Action:** Send a cold email from an openprimitive.com email address (set up a simple forward if needed) to:

- The MCP newsletter (if one exists — check https://modelcontextprotocol.io for a blog/newsletter)
- AI tool roundup newsletters: Ben's Bites (https://bensbites.beehiiv.com/subscribe), The Neuron (https://www.theneurondaily.com/), TLDR AI (https://tldr.tech/ai)

Email template:

> Subject: Open Primitive Protocol — signed data envelopes for AI agents
>
> 16 US federal data domains. Every response carries provenance, freshness, confidence, and a cryptographic signature. MCP server, A2A agent card, and REST API.
>
> npm: npx -y open-primitive-mcp
> API: api.openprimitive.com
> Spec: openprimitive.com/protocol.html
>
> Happy to provide any details for a mention.

**Identity:** openprimitive.com email. No personal name needed.
**Flag:** Some newsletters require a personal contact. If asked, "David at Open Primitive" is minimal exposure.
**Expected result:** 1 in 5 newsletters will mention it. One mention = 2,000-10,000 views.

---

### Day 29 — Create a GitHub org and transfer

**Action:** Create a GitHub organization called `openprimitive`. Transfer the `open-primitive-api` repo into it. Update all links (npm, registries, drafts).

**Identity:** GitHub org. This removes writesdavid from the URL entirely. Repo becomes github.com/openprimitive/open-primitive-api.

**Expected result:** Clean project identity. All future contributions come from the org, not a personal account. This is the single most important depersonalization step.

**Warning:** Transferring a repo changes all URLs. Update: npm package repository field, all registry listings, Dev.to links, README badges. GitHub auto-redirects the old URL, but don't rely on it forever.

---

### Day 30 — Audit and plan Month 2

**Action:** Pull numbers:

- npm weekly downloads (https://www.npmjs.com/package/open-primitive-mcp)
- GitHub stars and forks
- API request logs (Vercel analytics)
- Registry listing views (Smithery, mcp.so, Glama dashboards)
- Dev.to post views
- Reddit post karma and comment counts

Write a one-page internal doc: what worked, what didn't, what to double down on in Month 2.

**Identity:** N/A. Internal.
**Expected result:** Data-driven plan for Month 2. Expected Month 1 totals: 100-500 npm installs, 50-200 GitHub stars, 10,000-50,000 total impressions across all channels.

---

## Expected Outcome Ranges (30 days)

| Metric | Low | Mid | High |
|--------|-----|-----|------|
| npm weekly downloads | 20 | 100 | 500 |
| GitHub stars | 30 | 100 | 400 |
| API requests/day | 50 | 200 | 1,000 |
| Total impressions | 5,000 | 25,000 | 100,000 |
| Registry listings live | 4 | 5 | 6 |
| Newsletter mentions | 0 | 1 | 3 |

The high range requires the Show HN post to hit the front page. The low range assumes nothing goes viral and all growth is organic from registries.

---

## Actions That Require Personal Identity (Flagged)

1. **Day 4** — awesome-mcp-servers PR (GitHub username visible)
2. **Day 5** — modelcontextprotocol/servers PR (GitHub username visible)
3. **Day 8** — Show HN (HN username visible, but HN culture doesn't care)
4. **Day 16** — MCP SDK issue (GitHub username visible)
5. **Day 24** — Lobste.rs (real name convention — skip if needed)
6. **Day 28** — Newsletter outreach (may require "David at Open Primitive" if pressed)

All other actions can run entirely under the "Open Primitive" project identity.

---

## Actions That Can Wait (If Overwhelmed)

Cut these first:
- Day 11 (r/artificial — low volume)
- Day 13 (r/ChatGPT — wrong audience)
- Day 18 (Discord servers — time-intensive)
- Day 19 (Hashnode cross-post — marginal)
- Day 24 (Lobste.rs — invite-gated)
- Day 25 (Standards bodies — long-term, no short-term impact)

Never cut these:
- Day 3 (mcp.so — highest-traffic MCP directory)
- Day 4 (awesome-mcp-servers — evergreen traffic)
- Day 6 (Dev.to tutorial — SEO compound)
- Day 8 (Show HN — highest single-day ceiling)
- Day 29 (GitHub org transfer — permanent depersonalization)
