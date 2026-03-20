# awesome-mcp-servers PR

Target repo: https://github.com/punkpeye/awesome-mcp-servers

## PR Title

Add open-primitive-mcp 🤖🤖🤖

## PR Body

Adds Open Primitive MCP server to the Data & Databases category.

Open Primitive exposes 16 US federal data domains (FAA, NHTSA, FDA, EPA, CMS, NIH, USDA, BLS, Census, SEC, NOAA) as MCP tools. Signed responses, cross-domain intelligence, natural language routing.

- GitHub: https://github.com/writesdavid/open-primitive-api
- npm: `open-primitive-mcp`
- Install: `npx -y open-primitive-mcp`

## Line to add

Add this line alphabetically in the **Data & Databases** section (after entries starting with "n", before entries starting with "p"):

```markdown
- [open-primitive-mcp](https://github.com/writesdavid/open-primitive-api) - 16 US federal data domains (FAA, NHTSA, FDA, EPA, CMS, NIH, USDA, BLS, Census, SEC, NOAA). Signed responses, cross-domain intelligence, natural language routing.
```

## Steps to submit

1. Fork https://github.com/punkpeye/awesome-mcp-servers
2. Clone your fork
3. Edit `README.md` — find the "Data & Databases" section, add the line above in alphabetical order
4. Commit and push
5. Open PR with title: `Add open-primitive-mcp 🤖🤖🤖`
6. The three robot emojis trigger auto-merge if the PR passes checks

## gh CLI shortcut

```bash
# Fork and clone
gh repo fork punkpeye/awesome-mcp-servers --clone

# Edit README.md (add the line in Data & Databases, alphabetically)
cd awesome-mcp-servers

# Commit and PR
git checkout -b add-open-primitive-mcp
# ... edit README.md ...
git add README.md
git commit -m "Add open-primitive-mcp"
git push -u origin add-open-primitive-mcp
gh pr create --title "Add open-primitive-mcp 🤖🤖🤖" --body "Adds Open Primitive MCP server — 16 US federal data domains as MCP tools.

- GitHub: https://github.com/writesdavid/open-primitive-api
- npm: open-primitive-mcp
- Install: npx -y open-primitive-mcp"
```
