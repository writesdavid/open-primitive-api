#!/usr/bin/env node
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
const nutrition = require('./sources/nutrition');
const jobs = require('./sources/jobs');
const demographics = require('./sources/demographics');
const products = require('./sources/products');
const sec = require('./sources/sec');
const safety = require('./sources/safety');
const weather = require('./sources/weather');
const location = require('./sources/location');
const compare = require('./sources/compare');
const ask = require('./sources/ask');
const risk = require('./sources/risk');
const eligible = require('./sources/eligible');
const air = require('./sources/air');
const alerts = require('./sources/alerts');
const federation = require('./sources/federation');
const meat = require('./sources/meat');

const server = new McpServer({
  name: 'open-primitive',
  version: '1.1.0',
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

// ─── NUTRITION ───
server.registerTool('get-nutrition', {
  title: 'Get Nutrition Data',
  description: 'Search USDA FoodData Central for nutrition facts or get details by FDC ID. Source: USDA.',
  inputSchema: z.object({
    query: z.string().optional().describe('Food search term (e.g. "banana", "cheddar cheese"). Omit if using fdcId.'),
    fdcId: z.string().optional().describe('FDC ID for a specific food item. Omit if using query.'),
  }),
}, async ({ query, fdcId }) => {
  const data = fdcId ? await nutrition.getFood(fdcId) : await nutrition.searchFood(query || '');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── JOBS ───
server.registerTool('get-jobs', {
  title: 'Get Jobs Data',
  description: 'Get unemployment rate or other BLS time series data. Source: Bureau of Labor Statistics.',
  inputSchema: z.object({
    seriesId: z.string().optional().describe('BLS series ID (e.g. "LNS14000000" for unemployment rate). Omit for default unemployment data.'),
  }),
}, async ({ seriesId }) => {
  const data = seriesId ? await jobs.getSeriesData(seriesId) : await jobs.getUnemployment();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── DEMOGRAPHICS ───
server.registerTool('get-demographics', {
  title: 'Get Demographics',
  description: 'Get Census demographics for a ZIP code: population, income, poverty, education, housing. Source: US Census ACS.',
  inputSchema: z.object({
    zip: z.string().describe('5-digit ZIP code'),
  }),
}, async ({ zip }) => {
  const data = await demographics.getByZip(zip);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── PRODUCT RECALLS ───
server.registerTool('get-product-recalls', {
  title: 'Get Product Recalls',
  description: 'Get recent CPSC consumer product recalls or search by keyword. Source: SaferProducts.gov.',
  inputSchema: z.object({
    query: z.string().optional().describe('Search term (product type or brand). Omit for recent recalls.'),
  }),
}, async ({ query }) => {
  const data = query ? await products.search(query) : await products.getRecent();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── SEC FILINGS ───
server.registerTool('get-sec-filings', {
  title: 'Get SEC Filings',
  description: 'Search SEC EDGAR for company filings or get structured financial facts by CIK. Source: SEC EDGAR.',
  inputSchema: z.object({
    query: z.string().optional().describe('Company name to search (e.g. "Apple"). Omit if using cik.'),
    cik: z.string().optional().describe('SEC CIK number for detailed company facts. Omit if using query.'),
  }),
}, async ({ query, cik }) => {
  const data = cik ? await sec.getCompanyFacts(cik) : await sec.searchCompany(query || '');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── SAFETY PROFILE ───
server.registerTool('get-safety-profile', {
  title: 'Get Safety Profile',
  description: 'Get a cross-domain safety composite for a ZIP code combining water quality and hospital ratings. Source: EPA + CMS.',
  inputSchema: z.object({
    zip: z.string().describe('5-digit ZIP code'),
  }),
}, async ({ zip }) => {
  const data = await safety.getSafetyProfile(zip);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── WEATHER ───
server.registerTool('get-weather', {
  title: 'Get Weather',
  description: 'Get 7-day forecast by ZIP code or active weather alerts by state. Source: NOAA NWS.',
  inputSchema: z.object({
    zip: z.string().optional().describe('5-digit ZIP code for forecast'),
    state: z.string().optional().describe('2-letter state code for active alerts (e.g. "TX")'),
  }),
}, async ({ zip, state }) => {
  const data = state ? await weather.getAlerts(state) : await weather.getForecastByZip(zip || '');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── LOCATION ───
server.registerTool('get-location-profile', {
  title: 'Get Location Profile',
  description: 'Get a complete location profile for a ZIP code: demographics, safety, water, hospitals. Source: Census + EPA + CMS.',
  inputSchema: z.object({
    zip: z.string().describe('5-digit ZIP code'),
  }),
}, async ({ zip }) => {
  const data = await location.getLocationProfile(zip);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── COMPARE ───
server.registerTool('get-comparison', {
  title: 'Get Comparison',
  description: 'Side-by-side comparison of two ZIPs, drugs, or hospitals. Source: Multiple.',
  inputSchema: z.object({
    type: z.string().optional().describe('Comparison type: "drugs", "hospitals", or omit for ZIP comparison'),
    a: z.string().describe('First item to compare (ZIP, drug name, or hospital ID)'),
    b: z.string().describe('Second item to compare'),
  }),
}, async ({ type, a, b }) => {
  let data;
  if (type === 'drugs') data = await compare.compareDrugs(a, b);
  else if (type === 'hospitals') data = await compare.compareHospitals(a, b);
  else data = await compare.compareZips(a, b);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── ASK ───
server.registerTool('ask-question', {
  title: 'Ask a Question',
  description: 'Ask any question in plain English and get routed to the right federal data domain(s). Source: All.',
  inputSchema: z.object({
    q: z.string().describe('Your question (e.g. "Is the water safe in 90210?")'),
  }),
}, async ({ q }) => {
  const data = await ask.askQuestion(q);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── RISK ───
server.registerTool('get-risk', {
  title: 'Get Risk Profile',
  description: 'Get a composite risk score for a ZIP code across water, hospitals, weather, and demographics. Source: EPA + CMS + NOAA + Census.',
  inputSchema: z.object({
    zip: z.string().describe('5-digit ZIP code'),
  }),
}, async ({ zip }) => {
  const data = await risk.getRiskProfile(zip);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── ELIGIBILITY ───
server.registerTool('get-eligible', {
  title: 'Check Benefits Eligibility',
  description: 'Check eligibility for federal benefit programs (Medicaid, SNAP, EITC, CHIP, Pell Grant, etc.) based on income, household size, and state. Source: HHS + CMS + IRS + HUD.',
  inputSchema: z.object({
    income: z.string().describe('Annual household income in dollars (e.g. "35000")'),
    household: z.string().describe('Number of people in household (e.g. "4")'),
    state: z.string().describe('2-letter state code (e.g. "CA")'),
  }),
}, async ({ income, household, state }) => {
  const data = await eligible.checkEligibility({ income, household, state });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── AIR QUALITY ───
server.registerTool('get-air-quality', {
  title: 'Get Air Quality',
  description: 'Get current AQI and air quality forecast for a ZIP code. Source: AirNow (EPA).',
  inputSchema: z.object({
    zip: z.string().describe('5-digit ZIP code'),
    forecast: z.boolean().optional().describe('Set true for forecast instead of current conditions'),
  }),
}, async ({ zip, forecast }) => {
  const data = forecast ? await air.getAirForecast(zip) : await air.getAirQuality(zip);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── ALERTS ───
server.registerTool('get-alerts', {
  title: 'Get Recall Alerts',
  description: 'Get a feed of recent food and product recall alerts. Source: FDA + CPSC.',
  inputSchema: z.object({}),
}, async () => {
  const data = await alerts.getAlertFeed();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── FEDERATED QUERY ───
server.registerTool('federated-query', {
  title: 'Federated Query',
  description: 'Query multiple data domains at once across the Open Primitive network. Source: All federated providers.',
  inputSchema: z.object({
    domains: z.string().describe('Comma-separated domain list (e.g. "water,hospitals,demographics")'),
    zip: z.string().optional().describe('5-digit ZIP code (if applicable)'),
    q: z.string().optional().describe('Search query (if applicable)'),
  }),
}, async ({ domains, zip, q }) => {
  const data = await federation.federatedQuery({ domains, zip, q });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── MEAT (FSIS) ───
server.registerTool('get-meat-safety', {
  title: 'Get Meat Safety',
  description: 'Get FSIS meat, poultry, and egg product recalls or look up inspected establishments. Source: USDA FSIS.',
  inputSchema: z.object({
    query: z.string().optional().describe('Search term for recalls (e.g. "chicken", "salmonella"). Omit for recent recalls.'),
    establishment: z.string().optional().describe('FSIS establishment number for inspection data (e.g. "12345").'),
  }),
}, async ({ query, establishment }) => {
  let data;
  if (establishment) data = await meat.getEstablishment(establishment);
  else if (query) data = await meat.search(query);
  else data = await meat.getRecent();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// Start
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
