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

server.registerTool('search-unclaimed-property', {
  title: 'Search Unclaimed Property',
  description: 'Search for unclaimed property (money, assets) across federal and state databases. Source: State Unclaimed Property Offices + Federal.',
  inputSchema: z.object({
    first_name: z.string().describe('First name of the person to search for.'),
    last_name: z.string().describe('Last name of the person to search for.'),
    state: z.string().optional().describe('Two-letter state code to narrow search (e.g. "CA", "TX"). Omit to search all.'),
    sources: z.string().optional().describe('Comma-separated sources: "federal", "states", or "all" (default "all").'),
  }),
}, async ({ first_name, last_name, state, sources }) => {
  const params = new URLSearchParams({ first_name, last_name });
  if (state) params.set('state', state);
  if (sources) params.set('sources', sources);
  const resp = await fetch(`https://api.openprimitive.com/v1/reclaim/search?${params}`);
  const data = await resp.json();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── COURT RECORDS ───
server.registerTool('search-court-records', {
  title: 'Search Court Records',
  description: 'Search federal and state court records by query, party name, court, or date range. Source: CourtListener / PACER.',
  inputSchema: z.object({
    q: z.string().optional().describe('Search query (case name, topic, etc.)'),
    party: z.string().optional().describe('Party name to filter by'),
    court: z.string().optional().describe('Court filter (e.g. "scotus", "ca9", "nysd")'),
    after: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
    before: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
  }),
}, async ({ q, party, court, after, before }) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (party) params.set('party', party);
  if (court) params.set('court', court);
  if (after) params.set('after', after);
  if (before) params.set('before', before);
  const resp = await fetch(`https://api.openprimitive.com/v1/courts/search?${params}`);
  const data = await resp.json();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── FEDERAL REGISTER ───
server.registerTool('search-federal-register', {
  title: 'Search Federal Register',
  description: 'Search the Federal Register for rules, proposed rules, notices, and presidential documents. Source: Federal Register API.',
  inputSchema: z.object({
    q: z.string().optional().describe('Search query'),
    agency: z.string().optional().describe('Agency slug (e.g. "environmental-protection-agency")'),
    type: z.string().optional().describe('Document type: rule, proposed_rule, notice, presidential_document'),
    after: z.string().optional().describe('Published after date (YYYY-MM-DD)'),
  }),
}, async ({ q, agency, type, after }) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (agency) params.set('agency', agency);
  if (type) params.set('type', type);
  if (after) params.set('after', after);
  const resp = await fetch(`https://api.openprimitive.com/v1/federal-register/search?${params}`);
  const data = await resp.json();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.registerTool('get-federal-register-document', {
  title: 'Get Federal Register Document',
  description: 'Get a specific Federal Register document by document number. Source: Federal Register API.',
  inputSchema: z.object({
    document_number: z.string().describe('Federal Register document number (e.g. "2024-12345")'),
  }),
}, async ({ document_number }) => {
  const resp = await fetch(`https://api.openprimitive.com/v1/federal-register/documents/${encodeURIComponent(document_number)}`);
  const data = await resp.json();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── SCHOOLS ───
server.registerTool('search-schools', {
  title: 'Search Schools',
  description: 'Search K-12 schools and districts by name, state, or ZIP code. Source: NCES.',
  inputSchema: z.object({
    name: z.string().optional().describe('School or district name'),
    state: z.string().optional().describe('2-letter state code (e.g. "CA")'),
    zip: z.string().optional().describe('5-digit ZIP code'),
  }),
}, async ({ name, state, zip }) => {
  const params = new URLSearchParams();
  if (name) params.set('name', name);
  if (state) params.set('state', state);
  if (zip) params.set('zip', zip);
  const resp = await fetch(`https://api.openprimitive.com/v1/schools/search?${params}`);
  const data = await resp.json();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.registerTool('get-school', {
  title: 'Get School',
  description: 'Get detailed data for a specific school by NCES ID. Source: NCES.',
  inputSchema: z.object({
    id: z.string().describe('NCES school ID'),
  }),
}, async ({ id }) => {
  const resp = await fetch(`https://api.openprimitive.com/v1/schools/${encodeURIComponent(id)}`);
  const data = await resp.json();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── ELECTRICITY ───
server.registerTool('get-electricity-price', {
  title: 'Get Electricity Price',
  description: 'Get average electricity price by state. Source: EIA.',
  inputSchema: z.object({
    state: z.string().describe('2-letter state code (e.g. "TX")'),
  }),
}, async ({ state }) => {
  const resp = await fetch(`https://api.openprimitive.com/v1/electricity/price?state=${encodeURIComponent(state)}`);
  const data = await resp.json();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── BROADBAND ───
server.registerTool('get-broadband', {
  title: 'Get Broadband Data',
  description: 'Get broadband availability and speed data by ZIP code or state. Source: FCC BDC.',
  inputSchema: z.object({
    zip: z.string().optional().describe('5-digit ZIP code'),
    state: z.string().optional().describe('2-letter state code (e.g. "CA")'),
  }),
}, async ({ zip, state }) => {
  const params = new URLSearchParams();
  if (zip) params.set('zip', zip);
  if (state) params.set('state', state);
  const resp = await fetch(`https://api.openprimitive.com/v1/broadband?${params}`);
  const data = await resp.json();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── ENTITY GRAPH ───
server.registerTool('query-entity-graph', {
  title: 'Query Entity Graph',
  description: 'Query the Open Primitive entity graph to get cross-domain linked data for a ZIP, company, drug, geographic area, or FIPS code. Source: Open Primitive.',
  inputSchema: z.object({
    entity_type: z.string().describe('Entity type: zip, company, drug, geographic, fips'),
    identifier: z.string().describe('Entity identifier (e.g. "90210", "AAPL", "ibuprofen", "06037")'),
  }),
}, async ({ entity_type, identifier }) => {
  const resp = await fetch(`https://api.openprimitive.com/v1/graph/${encodeURIComponent(entity_type)}/${encodeURIComponent(identifier)}`);
  const data = await resp.json();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── SUBSCRIPTIONS ───
server.registerTool('create-subscription', {
  title: 'Create Subscription',
  description: 'Subscribe an agent to data change notifications for a domain with optional filters. Source: Open Primitive.',
  inputSchema: z.object({
    agent_id: z.string().describe('Unique agent identifier'),
    domain: z.string().describe('Data domain to subscribe to (e.g. "food-recalls", "weather-alerts")'),
    filter: z.string().optional().describe('JSON filter object to narrow subscription scope'),
    webhook_url: z.string().describe('Webhook URL to receive notifications'),
  }),
}, async ({ agent_id, domain, filter, webhook_url }) => {
  const body = { agent_id, domain, webhook_url };
  if (filter) body.filter = JSON.parse(filter);
  const resp = await fetch('https://api.openprimitive.com/v1/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ─── COMPLIANCE ───
server.registerTool('assess-compliance', {
  title: 'Assess Compliance',
  description: 'Assess AI compliance posture against a regulatory framework. Source: Open Primitive.',
  inputSchema: z.object({
    domain: z.string().describe('Application domain to assess (e.g. "healthcare", "finance", "hiring")'),
    jurisdiction: z.string().describe('Regulatory framework: eu-ai-act, nist-ai-rmf, eo-14110, canada-aida'),
  }),
}, async ({ domain, jurisdiction }) => {
  const params = new URLSearchParams({ domain, jurisdiction });
  const resp = await fetch(`https://api.openprimitive.com/v1/compliance/assess?${params}`);
  const data = await resp.json();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// Start
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
