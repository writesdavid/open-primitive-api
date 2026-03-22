# PR Submissions — Ready to Execute
**Date:** 2026-03-21
**Status:** Blocked on `gh auth login` (see Step 0)

---

## Step 0: Authenticate gh CLI

gh is not authenticated. Run this first. Everything below depends on it.

```bash
gh auth login
```

Select: GitHub.com > HTTPS > Login with a web browser. Follow the prompts.

Then confirm:

```bash
gh auth status
```

---

## Step 0.5: Make the repo public

The awesome-mcp-servers maintainers will click through to verify the repo exists. If it is private, the PR gets rejected.

```bash
gh repo edit writesdavid/open-primitive-api --visibility public
```

---

## PR 1: awesome-mcp-servers (83K stars)

Target: https://github.com/punkpeye/awesome-mcp-servers

The three robot emojis in the PR title trigger their auto-merge bot.

### Commands (copy-paste the entire block)

```bash
# Fork and clone
gh repo fork punkpeye/awesome-mcp-servers --clone
cd awesome-mcp-servers

# Create branch
git checkout -b add-open-primitive-mcp
```

Now edit `README.md`. Find the **Data & Databases** section. Add this line in alphabetical order (after entries starting with "n", before entries starting with "p"):

```
- [open-primitive-mcp](https://github.com/writesdavid/open-primitive-api) - 16 US federal data domains (FAA, NHTSA, FDA, EPA, CMS, NIH, USDA, BLS, Census, SEC, NOAA) as MCP tools. Signed responses with provenance.
```

Then commit, push, and open the PR:

```bash
git add README.md
git commit -m "Add open-primitive-mcp"
git push -u origin add-open-primitive-mcp
gh pr create --title "Add open-primitive-mcp 🤖🤖🤖" --body "$(cat <<'EOF'
Adds Open Primitive MCP server to the Data & Databases category.

Open Primitive exposes 16 US federal data domains (FAA, NHTSA, FDA, EPA, CMS, NIH, USDA, BLS, Census, SEC, NOAA) as MCP tools. Signed responses, cross-domain intelligence, natural language routing.

- GitHub: https://github.com/writesdavid/open-primitive-api
- npm: `open-primitive-mcp`
- Install: `npx -y open-primitive-mcp`
EOF
)"
```

### After submitting

The bot checks: (1) PR title has three robot emojis, (2) the link resolves, (3) the description is non-empty. If all pass, it auto-merges.

---

## PR 2: us-gov-open-data-mcp — GitHub Issue (not a PR)

Target: https://github.com/jefedigital/us-gov-open-data-mcp

This is a complementary project, not a competitor. We open an issue proposing they adopt response provenance metadata. Frame it as helping their users trust the data.

### Command (copy-paste the entire block)

```bash
gh issue create --repo jefedigital/us-gov-open-data-mcp \
  --title "Proposal: Add response provenance metadata" \
  --body "$(cat <<'EOF'
## The problem

When an agent gets federal data from an MCP server, it has no way to verify where the data came from, how fresh it is, or how confident the server is in the response. The agent (or the human reviewing the output) has to trust blindly.

## Proposal

Add a `provenance` object to each response with three fields:

- **source**: the upstream federal API or dataset the data came from (URL or identifier)
- **freshness**: when the data was last fetched or cached, in ISO 8601
- **confidence**: a 0-1 score reflecting whether the upstream returned clean data, partial data, or fell back to cache

Example:

```json
{
  "data": { ... },
  "provenance": {
    "source": "https://api.fda.gov/drug/event.json",
    "freshness": "2026-03-21T14:30:00Z",
    "confidence": 0.95
  }
}
```

## Why this matters

Federal data changes. APIs go down. Caches go stale. Agents that consume this data downstream need a machine-readable way to assess trust. Without it, a stale cached response looks identical to a fresh one.

## Prior art

The Open Provenance Protocol (OPP) spec defines a standard for this:
https://github.com/writesdavid/open-primitive-api/blob/main/docs/opp-spec.md

We implemented this in Open Primitive MCP (a similar federal data MCP server) and found it straightforward to add — roughly 20 lines of middleware. Happy to share the implementation if useful.

This is not a pitch to use our code. It is a suggestion that response provenance metadata would make your server more trustworthy for agent workflows. Your project already covers the hard part (the federal data integrations). Adding provenance metadata would put it ahead of every other government data MCP server.
EOF
)"
```

---

## PR 3: modelcontextprotocol/servers — Official MCP registry

Target: https://github.com/modelcontextprotocol/servers

### Status: No longer accepting PRs for new servers

The official MCP servers repo stopped accepting community server submissions. Their README says to use `mcp-publisher` to register servers in the MCP registry instead.

You already have `mcp-publisher` documented. The command:

```bash
npx @anthropic/mcp-publisher publish
```

### Alternative: Community visibility

Three places to post instead:

1. **MCP Discord** — The Model Context Protocol Discord has a #showcase channel. Post there with a one-liner and the npm install command.
   - https://discord.gg/modelcontextprotocol (or search "Model Context Protocol Discord")

2. **GitHub Discussions on modelcontextprotocol/servers** — If discussions are enabled, open a "Show and Tell" post:

```bash
gh api repos/modelcontextprotocol/servers --jq '.has_discussions'
```

If true:

```bash
gh discussion create --repo modelcontextprotocol/servers \
  --category "Show and Tell" \
  --title "open-primitive-mcp: 16 US federal data domains as MCP tools" \
  --body "$(cat <<'EOF'
Open Primitive MCP server — exposes 16 US federal data domains (FAA, NHTSA, FDA, EPA, CMS, NIH, USDA, BLS, Census, SEC, NOAA) as MCP tools with signed responses and provenance metadata.

Install: `npx -y open-primitive-mcp`

GitHub: https://github.com/writesdavid/open-primitive-api
npm: https://www.npmjs.com/package/open-primitive-mcp

Each response includes cryptographic provenance (Ed25519 DataIntegrityProof) so agents can verify data origin and freshness.
EOF
)"
```

3. **awesome-mcp-servers** — Already covered in PR 1 above.

### Bottom line for PR 3

Run `npx @anthropic/mcp-publisher publish` to get into the official registry. Post to Discord and GitHub Discussions for visibility. No PR needed or accepted.

---

## Execution order

1. `gh auth login`
2. `gh repo edit writesdavid/open-primitive-api --visibility public`
3. PR 1 (awesome-mcp-servers) — highest impact, 83K stars
4. PR 2 (us-gov-open-data-mcp issue) — strategic positioning
5. PR 3 alternatives (mcp-publisher, Discord, Discussions) — registry presence

Total time estimate: 15 minutes after auth.
