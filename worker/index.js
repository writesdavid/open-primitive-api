import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Source modules (CommonJS — nodejs_compat handles require)
const flights = require('../sources/flights');
const cars = require('../sources/cars');
const food = require('../sources/food');
const water = require('../sources/water');
const drugs = require('../sources/drugs');
const hospitals = require('../sources/hospitals');
const health = require('../sources/health');
const safety = require('../sources/safety');
const nutrition = require('../sources/nutrition');
const jobs = require('../sources/jobs');
const demographics = require('../sources/demographics');
const products = require('../sources/products');
const sec = require('../sources/sec');
const weather = require('../sources/weather');
const location = require('../sources/location');
const compare = require('../sources/compare');
const ask = require('../sources/ask');
const alerts = require('../sources/alerts');
const risk = require('../sources/risk');
const federation = require('../sources/federation');
const air = require('../sources/air');
const eligible = require('../sources/eligible');

// ─── Agent detection (in-memory stats) ───

const AGENT_PATTERNS = [
  { pattern: /claudebot|claude-user|claude-searchbot|claude-web|anthropic-ai/i, name: 'claude' },
  { pattern: /chatgpt-user|gptbot|oai-searchbot|openai/i, name: 'chatgpt' },
  { pattern: /perplexitybot|perplexity-user/i, name: 'perplexity' },
  { pattern: /google-extended|googlebot-extended/i, name: 'google' },
  { pattern: /bingbot|bingpreview/i, name: 'bing' },
  { pattern: /meta-externalagent|facebookbot/i, name: 'meta' },
  { pattern: /applebot-extended/i, name: 'apple' },
  { pattern: /amazonbot/i, name: 'amazon' },
  { pattern: /bytespider/i, name: 'bytedance' },
  { pattern: /ccbot/i, name: 'ccbot' },
  { pattern: /cohere-ai/i, name: 'cohere' },
  { pattern: /diffbot/i, name: 'diffbot' },
  { pattern: /bot|crawler|spider/i, name: 'unknown-bot' },
];

const stats = {
  total: 0,
  agent: 0,
  human: 0,
  byAgent: {},
  byEndpoint: {},
  topQueries: {},
  hourly: Array.from({ length: 24 }, (_, i) => ({ hour: i, agent: 0, human: 0 })),
  upSince: new Date().toISOString(),
};

const QUERY_EXTRACTORS = {
  drugs:     (q) => q.name,
  water:     (q) => q.zip,
  cars:      (q) => [q.make, q.model].filter(Boolean).join(' ') || null,
  ask:       (q) => q.q ? q.q.substring(0, 50) : null,
  food:      (q) => q.q,
  hospitals: (q) => q.q || q.id,
  nutrition: (q) => q.q || q.id,
  health:    (q) => q.q,
};

function trackQuery(domain, queryValue) {
  if (!queryValue) return;
  const val = String(queryValue).toLowerCase().trim();
  if (!val) return;
  if (!stats.topQueries[domain]) stats.topQueries[domain] = {};
  stats.topQueries[domain][val] = (stats.topQueries[domain][val] || 0) + 1;
  const entries = Object.entries(stats.topQueries[domain]);
  if (entries.length > 50) {
    entries.sort((a, b) => b[1] - a[1]);
    stats.topQueries[domain] = Object.fromEntries(entries.slice(0, 50));
  }
}

function detectAgent(ua) {
  if (!ua) return null;
  for (const { pattern, name } of AGENT_PATTERNS) {
    if (pattern.test(ua)) return name;
  }
  return null;
}

function getQueryParams(c) {
  const url = new URL(c.req.url);
  const params = {};
  for (const [k, v] of url.searchParams) {
    params[k] = v;
  }
  return params;
}

// ─── Hono app ───

const app = new Hono();

// CORS
app.use('*', cors({
  origin: '*',
  allowHeaders: ['X-API-Key', 'Content-Type'],
}));

// Agent detection middleware
app.use('*', async (c, next) => {
  const ua = c.req.header('user-agent') || '';
  const hasApiKey = !!c.req.header('x-api-key');

  let agentName = detectAgent(ua);
  if (!agentName && hasApiKey) agentName = 'api-client';

  c.set('isAgent', !!agentName);
  c.set('agentName', agentName || 'human');

  stats.total++;
  const hour = new Date().getUTCHours();
  const isAgent = !!agentName;

  if (isAgent) {
    stats.agent++;
    stats.byAgent[agentName] = (stats.byAgent[agentName] || 0) + 1;
    stats.hourly[hour].agent++;
  } else {
    stats.human++;
    stats.hourly[hour].human++;
  }

  const endpoint = new URL(c.req.url).pathname;
  if (!stats.byEndpoint[endpoint]) {
    stats.byEndpoint[endpoint] = { agent: 0, human: 0 };
  }
  stats.byEndpoint[endpoint][isAgent ? 'agent' : 'human']++;

  const match = endpoint.match(/^\/v1\/(\w+)/);
  if (match) {
    const domain = match[1];
    const extractor = QUERY_EXTRACTORS[domain];
    if (extractor) {
      const params = getQueryParams(c);
      trackQuery(domain, extractor(params));
    }
  }

  await next();
});

// ─── Wrap helper ───

async function wrap(c, promise) {
  try {
    const data = await promise;
    if (data && data.error) return c.json(data, 400);
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

// ─── PING ───
app.get('/ping', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── META ───
app.get('/v1', (c) => {
  return c.json({
    name: 'Open Primitive API',
    version: '1.0.0',
    description: 'Federal data for agents. 17 domains, one API.',
    domains: {
      flights: { endpoint: '/v1/flights', source: 'FAA NAS + Open-Meteo', description: 'Live airline delays and hub weather for 8 US carriers' },
      cars: { endpoint: '/v1/cars?year=&make=&model=', source: 'NHTSA', description: 'Crash safety ratings and recalls for any US vehicle' },
      food: { endpoint: '/v1/food', source: 'FDA Enforcement', description: 'Active food recalls and search by product or brand' },
      water: { endpoint: '/v1/water?zip=', source: 'EPA SDWIS', description: 'Drinking water systems and violations by ZIP code' },
      drugs: { endpoint: '/v1/drugs?name=', source: 'FDA FAERS', description: 'Drug adverse events, reactions, and label warnings' },
      hospitals: { endpoint: '/v1/hospitals?q=', source: 'CMS Care Compare', description: 'Hospital quality ratings, mortality, readmissions' },
      health: { endpoint: '/v1/health?q=', source: 'PubMed/MEDLINE', description: 'Research evidence for supplements and health claims' },
      nutrition: { endpoint: '/v1/nutrition?q=', source: 'USDA FoodData Central', description: 'Nutrition facts for any food: calories, macros, micronutrients' },
      jobs: { endpoint: '/v1/jobs', source: 'Bureau of Labor Statistics', description: 'Unemployment rate, CPI, employment data, wage statistics' },
      demographics: { endpoint: '/v1/demographics?zip=', source: 'US Census ACS', description: 'Population, income, poverty, education, housing by ZIP code' },
      products: { endpoint: '/v1/products', source: 'CPSC', description: 'Consumer product recalls and safety alerts' },
      sec: { endpoint: '/v1/sec?q=', source: 'SEC EDGAR', description: 'Corporate filings, financial facts, insider trading' },
      safety: { endpoint: '/v1/safety?zip=', source: 'EPA + CMS', description: 'Cross-domain safety profile: water quality, hospital ratings, composite score' },
      weather: { endpoint: '/v1/weather?zip=', source: 'NOAA NWS', description: '7-day forecast and active alerts' },
      location: { endpoint: '/v1/location?zip=', source: 'Census + EPA + CMS', description: 'Complete location profile: demographics + safety in one call' },
      compare: { endpoint: '/v1/compare?type=&a=&b=', source: 'Multiple', description: 'Side-by-side comparison of ZIPs, drugs, or hospitals' },
      ask: { endpoint: '/v1/ask?q=', source: 'All', description: 'Natural language query — ask any question, we route to the right domain(s)' },
      eligible: { endpoint: '/v1/eligible?income=45000&household=3&state=TX', source: 'HHS, CMS, IRS, HUD', description: 'Federal benefits eligibility: SNAP, Medicaid, EITC, CHIP, LIHEAP based on income, household size, and state' },
    },
    auth: 'Pass API key via X-API-Key header or ?api_key= query parameter',
    rateLimit: '500 requests per day (free), higher with API key',
    mcp: 'MCP server available at /mcp or via stdio (node mcp.js)',
  });
});

// ─── FLIGHTS ───
app.get('/v1/flights', (c) => wrap(c, flights.getAirlines()));
app.get('/v1/flights/:iata', (c) => wrap(c, flights.getAirline(c.req.param('iata'))));

// ─── CARS ───
app.get('/v1/cars', (c) => wrap(c, cars.getSafety(c.req.query('year'), c.req.query('make'), c.req.query('model'))));

// ─── FOOD ───
app.get('/v1/food', (c) => {
  const q = c.req.query('q');
  if (q) return wrap(c, food.search(q));
  return wrap(c, food.getRecent());
});

// ─── WATER ───
app.get('/v1/water', (c) => wrap(c, water.searchByZip(c.req.query('zip'))));
app.get('/v1/water/:pwsid', (c) => wrap(c, water.getSystem(c.req.param('pwsid'))));

// ─── DRUGS ───
app.get('/v1/drugs', (c) => wrap(c, drugs.getDrug(c.req.query('name'))));

// ─── HOSPITALS ───
app.get('/v1/hospitals', (c) => {
  const id = c.req.query('id');
  if (id) return wrap(c, hospitals.getHospital(id));
  return wrap(c, hospitals.searchHospitals(c.req.query('q')));
});

// ─── HEALTH ───
app.get('/v1/health', (c) => wrap(c, health.searchHealth(c.req.query('q'))));

// ─── SAFETY ───
app.get('/v1/safety', (c) => wrap(c, safety.getSafetyProfile(c.req.query('zip'))));

// ─── NUTRITION ───
app.get('/v1/nutrition', (c) => {
  const id = c.req.query('id');
  if (id) return wrap(c, nutrition.getFood(id));
  return wrap(c, nutrition.searchFood(c.req.query('q')));
});

// ─── JOBS ───
app.get('/v1/jobs', (c) => {
  const series = c.req.query('series');
  if (series) return wrap(c, jobs.getSeriesData(series));
  return wrap(c, jobs.getUnemployment());
});

// ─── DEMOGRAPHICS ───
app.get('/v1/demographics', (c) => wrap(c, demographics.getByZip(c.req.query('zip'))));

// ─── PRODUCTS ───
app.get('/v1/products', (c) => {
  const q = c.req.query('q');
  if (q) return wrap(c, products.search(q));
  return wrap(c, products.getRecent());
});

// ─── SEC ───
app.get('/v1/sec', (c) => {
  const cik = c.req.query('cik');
  if (cik) return wrap(c, sec.getCompanyFacts(cik));
  return wrap(c, sec.searchCompany(c.req.query('q')));
});

// ─── AIR ───
app.get('/v1/air', (c) => {
  if (c.req.query('forecast')) return wrap(c, air.getAirForecast(c.req.query('zip')));
  return wrap(c, air.getAirQuality(c.req.query('zip')));
});

// ─── WEATHER ───
app.get('/v1/weather', (c) => {
  if (c.req.query('state')) return wrap(c, weather.getAlerts(c.req.query('state')));
  return wrap(c, weather.getForecastByZip(c.req.query('zip')));
});

// ─── LOCATION ───
app.get('/v1/location', (c) => wrap(c, location.getLocationProfile(c.req.query('zip'))));

// ─── COMPARE ───
app.get('/v1/compare', (c) => {
  const type = c.req.query('type');
  const a = c.req.query('a');
  const b = c.req.query('b');
  if (type === 'drugs') return wrap(c, compare.compareDrugs(a, b));
  if (type === 'hospitals') return wrap(c, compare.compareHospitals(a, b));
  return wrap(c, compare.compareZips(a, b));
});

// ─── ASK ───
app.get('/v1/ask', (c) => wrap(c, ask.askQuestion(c.req.query('q'))));

// ─── DISCOVER ───
app.get('/v1/discover', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'q parameter is required' }, 400);
  try {
    // getReferralWithRegistry not ported yet — stub with empty array
    const internal = ask.detectDomains(q);
    const ownDomains = internal.filter((d) => d !== 'unknown');
    return c.json({
      query: q,
      own_domains: ownDomains,
      referrals: [],
      count: ownDomains.length,
    });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Discovery failed' }, 500);
  }
});

// ─── ELIGIBLE ───
app.get('/v1/eligible', (c) => wrap(c, eligible.checkEligibility(getQueryParams(c))));

// ─── RISK ───
app.get('/v1/risk', (c) => wrap(c, risk.getRiskProfile(c.req.query('zip'))));

// ─── ALERTS ───
app.get('/v1/alerts', (c) => wrap(c, alerts.getAlertFeed()));
app.post('/v1/alerts/check', (c) => wrap(c, alerts.checkForAlerts()));

// ─── FEDERATED ───
app.get('/v1/federated', (c) => wrap(c, federation.federatedQuery(getQueryParams(c))));

// ─── REGISTER (stub — needs Redis/KV) ───
app.post('/v1/register', async (c) => {
  return c.json({ error: 'Registration not yet available on Workers — use the primary API' }, 501);
});

// ─── REGISTRY (stub — needs Redis/KV) ───
app.post('/v1/registry/register', async (c) => {
  return c.json({ error: 'Registry not yet available on Workers' }, 501);
});
app.get('/v1/registry/search', async (c) => {
  return c.json({ error: 'Registry not yet available on Workers' }, 501);
});
app.get('/v1/registry', async (c) => {
  return c.json({ error: 'Registry not yet available on Workers' }, 501);
});

// ─── BILLING (stub — needs Stripe + Redis) ───
app.post('/v1/billing/checkout', async (c) => {
  return c.json({ error: 'Billing not yet available on Workers' }, 501);
});
app.post('/v1/billing/founding', async (c) => {
  return c.json({ error: 'Billing not yet available on Workers' }, 501);
});
app.post('/v1/billing/webhook', async (c) => {
  return c.json({ error: 'Billing not yet available on Workers' }, 501);
});
app.get('/v1/billing/usage', async (c) => {
  return c.json({ error: 'Billing not yet available on Workers' }, 501);
});

// ─── HISTORY (stub — needs Redis) ───
app.get('/v1/history', async (c) => {
  return c.json({ error: 'History not yet available on Workers' }, 501);
});

// ─── STATS ───
app.get('/v1/stats', (c) => {
  const pct = stats.total > 0 ? Math.round((stats.agent / stats.total) * 100) : 0;
  const agents = Object.entries(stats.byAgent).map(([name, count]) => ({ name, count }));
  const endpoints = Object.entries(stats.byEndpoint).map(([name, data]) => ({
    name,
    count: (data.agent || 0) + (data.human || 0),
    agent: data.agent || 0,
    human: data.human || 0,
  }));
  return c.json({
    agentPercent: pct,
    total: stats.total,
    agent: stats.agent,
    human: stats.human,
    agents,
    endpoints,
    byAgent: stats.byAgent,
    byEndpoint: stats.byEndpoint,
    topQueries: stats.topQueries,
    hourly: stats.hourly,
    upSince: stats.upSince,
  });
});

// ─── STATUS (simplified — no upstream health check yet) ───
app.get('/v1/status', async (c) => {
  return c.json({
    status: 'ok',
    runtime: 'cloudflare-workers',
    upSince: stats.upSince,
    timestamp: new Date().toISOString(),
  });
});

export default { fetch: app.fetch };
