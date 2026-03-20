#!/usr/bin/env node
'use strict';

const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { createMCPFromOPP } = require('./opp-mcp-bridge');

const PROVIDER_URL = process.env.OPP_PROVIDER_URL || 'https://api.openprimitive.com';

async function main() {
  const server = await createMCPFromOPP(PROVIDER_URL);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`opp-mcp-server failed: ${err.message}\n`);
  process.exit(1);
});
