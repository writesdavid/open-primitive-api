# mcp.so Submission

Submit at: https://mcp.so/submit (GitHub issue form)

## Title

Add Open Primitive - 16 US federal data domains as MCP tools

## Body

### Server Name

Open Primitive MCP

### GitHub URL

https://github.com/writesdavid/open-primitive-api

### npm Package

open-primitive-mcp

### Description

Open Primitive is an MCP server that exposes 16 US federal data domains as tools. It pulls from FAA, NHTSA, FDA, EPA, CMS, NIH, USDA, BLS, Census, SEC, and NOAA — covering flights, cars, food, water, drugs, hospitals, health, nutrition, jobs, demographics, consumer products, SEC filings, weather, and cross-domain safety scores.

All data comes from primary federal sources. No scraping, no third-party aggregators. Every response is cryptographically signed.

### Features

- 16 federal data domains as individual MCP tools
- Natural language routing — ask a question, get routed to the right agency
- Cross-domain intelligence — combine data across agencies for composite safety scores
- Signed responses with Ed25519 cryptographic signatures
- Works via stdio transport: `npx -y open-primitive-mcp`
- Zero configuration required

### Connection

```bash
npx -y open-primitive-mcp
```

Or add to your MCP client config:

```json
{
  "mcpServers": {
    "open-primitive": {
      "command": "npx",
      "args": ["-y", "open-primitive-mcp"]
    }
  }
}
```

### Categories

Data, Government, API
