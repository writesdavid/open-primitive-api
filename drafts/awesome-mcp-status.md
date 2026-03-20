# awesome-mcp-servers PR — Status

**Date:** 2026-03-20
**Status:** Blocked — gh CLI not authenticated

## What happened

`gh auth status` returned: "You are not logged into any GitHub hosts."

No steps could proceed without authentication.

## What David needs to run

### 1. Authenticate gh CLI

```bash
gh auth login
```

Select: GitHub.com, HTTPS, browser-based auth.

### 2. Make the repo public

```bash
gh repo edit writesdavid/open-primitive-api --visibility public
```

The repo must be public or the awesome-mcp-servers maintainers cannot verify it.

### 3. Fork, branch, edit, PR

```bash
# Fork and clone
gh repo fork punkpeye/awesome-mcp-servers --clone
cd awesome-mcp-servers

# Create branch
git checkout -b add-open-primitive-mcp
```

Edit `README.md` — find the **Data & Databases** section. Add this line in alphabetical order (after "n" entries, before "p" entries):

```
- [open-primitive-mcp](https://github.com/writesdavid/open-primitive-api) - 17 US federal data domains (FAA, NHTSA, FDA, EPA, CMS, NIH, USDA, BLS, Census, SEC, NOAA) as MCP tools. Signed responses with provenance.
```

Then commit, push, and open the PR:

```bash
git add README.md
git commit -m "Add open-primitive-mcp"
git push -u origin add-open-primitive-mcp
gh pr create --title "Add open-primitive-mcp 🤖🤖🤖" --body "Adds Open Primitive MCP server — 17 US federal data domains as MCP tools. Signed responses with provenance.

- GitHub: https://github.com/writesdavid/open-primitive-api
- npm: open-primitive-mcp
- Install: npx -y open-primitive-mcp"
```

The three robot emojis in the title trigger auto-merge if checks pass.

## After auth

Re-run this task and all steps can be automated.
