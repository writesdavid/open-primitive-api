const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const flights = require('./sources/flights');
const cars = require('./sources/cars');
const food = require('./sources/food');
const water = require('./sources/water');
const drugs = require('./sources/drugs');
const hospitals = require('./sources/hospitals');
const health = require('./sources/health');

const server = new McpServer({
  name: 'open-primitive',
  version: '1.0.0',
});

// ─── FLIGHTS ───
server.registerTool('get-flights', {
  title: 'Get Flight Status',
  description: 'Get live delay and weather data for 8 major US airlines. Source: FAA NAS + Open-Meteo.',
  inputSchema: z.object({
    airline: z.string().optional().describe('IATA code (DL, UA, AA, WN, AS, B6, G4, F9). Omit for all airlines.'),
  }),
}, async ({ airline }) => {
  const data = airline ? await flights.getAirline(airline) : await flights.getAirlines();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── CARS ───
server.registerTool('get-car-safety', {
  title: 'Get Car Safety',
  description: 'Get NHTSA crash safety ratings and recalls for a vehicle. Source: NHTSA.',
  inputSchema: z.object({
    year: z.string().describe('Model year (e.g. "2024")'),
    make: z.string().describe('Manufacturer (e.g. "Toyota")'),
    model: z.string().describe('Model name (e.g. "Camry")'),
  }),
}, async ({ year, make, model }) => {
  const data = await cars.getSafety(year, make, model);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── FOOD ───
server.registerTool('get-food-recalls', {
  title: 'Get Food Recalls',
  description: 'Get active FDA food recalls or search by product/brand. Source: FDA Enforcement.',
  inputSchema: z.object({
    query: z.string().optional().describe('Search term (product or brand). Omit for recent recalls.'),
  }),
}, async ({ query }) => {
  const data = query ? await food.search(query) : await food.getRecent();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── WATER ───
server.registerTool('get-water-safety', {
  title: 'Get Water Safety',
  description: 'Get drinking water system data and violations. Source: EPA SDWIS.',
  inputSchema: z.object({
    zip: z.string().optional().describe('5-digit ZIP code to find water systems'),
    pwsid: z.string().optional().describe('Public Water System ID for detailed violations'),
  }),
}, async ({ zip, pwsid }) => {
  const data = pwsid ? await water.getSystem(pwsid) : await water.searchByZip(zip || '');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── DRUGS ───
server.registerTool('get-drug-safety', {
  title: 'Get Drug Safety',
  description: 'Get FDA adverse event reports, top reactions, and label warnings for a drug. Source: FDA FAERS.',
  inputSchema: z.object({
    name: z.string().describe('Drug name (brand or generic, e.g. "ibuprofen")'),
  }),
}, async ({ name }) => {
  const data = await drugs.getDrug(name);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── HOSPITALS ───
server.registerTool('get-hospital-quality', {
  title: 'Get Hospital Quality',
  description: 'Search hospitals or get detailed quality ratings. Source: CMS Care Compare.',
  inputSchema: z.object({
    query: z.string().optional().describe('Hospital name or ZIP code to search'),
    providerId: z.string().optional().describe('CMS Provider ID for detailed quality data'),
  }),
}, async ({ query, providerId }) => {
  const data = providerId ? await hospitals.getHospital(providerId) : await hospitals.searchHospitals(query || '');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── HEALTH ───
server.registerTool('get-health-evidence', {
  title: 'Get Health Evidence',
  description: 'Search PubMed for research evidence on supplements or health claims. Source: PubMed/MEDLINE.',
  inputSchema: z.object({
    query: z.string().describe('Supplement name or health claim (e.g. "vitamin d", "turmeric inflammation")'),
  }),
}, async ({ query }) => {
  const data = await health.searchHealth(query);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// Start
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
