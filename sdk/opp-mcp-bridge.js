'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

/**
 * Parameter inference rules. Each domain's endpoint accepts query params.
 * The manifest doesn't declare params explicitly, so we infer from entityTypes
 * and known patterns. Any domain not listed here gets a generic "query" param.
 */
const PARAM_SCHEMAS = {
  flights: {
    airline: z.string().describe('Airline code (e.g. DL, UA, AA, WN)'),
    airport: z.string().optional().describe('Airport IATA code (e.g. ATL, LAX)'),
  },
  cars: {
    make: z.string().describe('Vehicle make (e.g. Toyota, Ford)'),
    model: z.string().optional().describe('Vehicle model (e.g. Camry, F-150)'),
    year: z.string().optional().describe('Model year (e.g. 2024)'),
  },
  food: {
    query: z.string().describe('Search term for food recalls (e.g. salmonella, lettuce)'),
    limit: z.string().optional().describe('Max results to return'),
  },
  water: {
    zip: z.string().describe('5-digit ZIP code'),
  },
  drugs: {
    name: z.string().describe('Drug name (brand or generic, e.g. ibuprofen, Lipitor)'),
  },
  hospitals: {
    zip: z.string().optional().describe('5-digit ZIP code'),
    name: z.string().optional().describe('Hospital name'),
    state: z.string().optional().describe('2-letter state code'),
  },
  health: {
    query: z.string().describe('Health topic or supplement name (e.g. vitamin D, melatonin)'),
  },
  nutrition: {
    query: z.string().describe('Food item to look up (e.g. banana, chicken breast)'),
  },
  jobs: {
    query: z.string().describe('Job category or BLS series ID'),
  },
  demographics: {
    zip: z.string().describe('5-digit ZIP code'),
  },
  products: {
    query: z.string().describe('Product recall search term'),
  },
  sec: {
    ticker: z.string().describe('Stock ticker symbol (e.g. AAPL, TSLA)'),
  },
  weather: {
    zip: z.string().optional().describe('5-digit ZIP code'),
    lat: z.string().optional().describe('Latitude'),
    lon: z.string().optional().describe('Longitude'),
  },
  safety: {
    zip: z.string().describe('5-digit ZIP code'),
  },
  location: {
    zip: z.string().describe('5-digit ZIP code'),
  },
  compare: {
    zips: z.string().describe('Comma-separated ZIP codes to compare'),
  },
};

/**
 * Fetches the OPP manifest from a provider URL and creates an McpServer
 * with one tool per domain. Each tool queries the provider's API and
 * returns the response as text content.
 *
 * @param {string} providerUrl - Base URL of the OPP provider (e.g. https://api.openprimitive.com)
 * @param {object} [options] - Optional overrides
 * @param {string} [options.apiKey] - API key for authenticated providers
 * @returns {Promise<McpServer>} Configured McpServer ready for transport connection
 */
async function createMCPFromOPP(providerUrl, options) {
  const baseUrl = providerUrl.replace(/\/$/, '');
  const apiKey = (options && options.apiKey) || process.env.OPP_API_KEY || null;

  // 1. Fetch the OPP manifest
  const manifestRes = await fetch(`${baseUrl}/.well-known/opp.json`);
  if (!manifestRes.ok) {
    throw new Error(`Failed to fetch OPP manifest from ${baseUrl}/.well-known/opp.json (${manifestRes.status})`);
  }
  const manifest = await manifestRes.json();

  if (!manifest.domains || !Array.isArray(manifest.domains)) {
    throw new Error('OPP manifest has no domains array');
  }

  const endpointBase = (manifest.endpoints && manifest.endpoints.base) || baseUrl;
  const queryPattern = (manifest.endpoints && manifest.endpoints.query) || '/v1/{domain}';

  // 2. Create the MCP server
  const server = new McpServer({
    name: manifest.name || 'OPP Server',
    version: manifest.version || '1.0.0',
  });

  // 3. Register a tool for each domain
  for (const domain of manifest.domains) {
    const toolName = domain.id;
    const description = `${domain.name} — ${domain.source}. Freshness: ${domain.freshness}. License: ${domain.license}.`;
    const paramSchema = PARAM_SCHEMAS[domain.id] || {
      query: z.string().describe('Search query'),
    };

    server.tool(toolName, description, paramSchema, async (params) => {
      const path = queryPattern.replace('{domain}', domain.id);
      const url = new URL(`${endpointBase}${path}`);

      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, v);
        }
      }

      const headers = { 'Accept': 'application/json' };
      if (apiKey) {
        headers['X-API-Key'] = apiKey;
      }

      try {
        const res = await fetch(url.toString(), { headers });
        const body = await res.text();

        if (!res.ok) {
          return {
            content: [{ type: 'text', text: `Error ${res.status}: ${body}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: body }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Request failed: ${err.message}` }],
          isError: true,
        };
      }
    });
  }

  return server;
}

module.exports = { createMCPFromOPP };
