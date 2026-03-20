# MCP Registry, Smithery, and Glama — Manual Steps

## Official MCP Registry

The official registry is at https://github.com/modelcontextprotocol/servers. Submission requires a PR to that repo.

### Steps

1. Fork https://github.com/modelcontextprotocol/servers
2. Add your server entry to the appropriate section in `README.md`
3. Open a PR with your addition
4. The maintainers (Anthropic team) review and merge

### Line to add

```markdown
- [open-primitive-mcp](https://github.com/writesdavid/open-primitive-api) - 16 US federal data domains (FAA, NHTSA, FDA, EPA, CMS, NIH, USDA, BLS, Census, SEC, NOAA) as MCP tools.
```

### gh CLI shortcut

```bash
gh repo fork modelcontextprotocol/servers --clone
cd servers
git checkout -b add-open-primitive-mcp
# Edit README.md — add line in appropriate category
git add README.md
git commit -m "Add open-primitive-mcp"
git push -u origin add-open-primitive-mcp
gh pr create --title "Add open-primitive-mcp" --body "Adds Open Primitive — 16 US federal data domains as MCP tools.

GitHub: https://github.com/writesdavid/open-primitive-api
npm: open-primitive-mcp"
```

---

## Smithery

Your `smithery.yaml` is already in the repo. Publish with:

```bash
npx smithery mcp publish "https://github.com/writesdavid/open-primitive-api" -n writesdavid/open-primitive-mcp
```

If `smithery` CLI is not installed:

```bash
npm install -g smithery
smithery mcp publish "https://github.com/writesdavid/open-primitive-api" -n writesdavid/open-primitive-mcp
```

Alternative: go to https://smithery.ai and submit the GitHub URL manually through their web UI.

---

## Glama

Glama auto-indexes public MCP servers from GitHub. To claim yours:

1. Go to https://glama.ai/mcp/servers
2. Search for `open-primitive-mcp` or `writesdavid/open-primitive-api`
3. If already indexed, click "Claim" and verify ownership via GitHub OAuth
4. If not indexed yet, submit the GitHub URL at https://glama.ai/mcp/servers/submit (or equivalent submission page)
5. Once claimed, you get a Glama badge URL to add to your README:

```markdown
[![Glama](https://glama.ai/mcp/servers/badge/writesdavid/open-primitive-api)](https://glama.ai/mcp/servers/writesdavid/open-primitive-api)
```

Note: The awesome-mcp-servers PR guide recommends listing on Glama first and including the badge in your PR.
