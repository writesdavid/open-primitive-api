import { Hono } from 'hono';
import { cors } from 'hono/cors';

const crypto = require('crypto');

// ─── Ed25519 Response Signing ───

let cachedPrivateKey = null;

function getPrivateKey(env) {
  if (cachedPrivateKey) return cachedPrivateKey;
  const pem = env.OPP_PRIVATE_KEY;
  if (!pem) return null;
  try {
    cachedPrivateKey = crypto.createPrivateKey(pem);
    return cachedPrivateKey;
  } catch (err) {
    console.error('Failed to load signing key:', err.message);
    return null;
  }
}

function signResponse(data, env) {
  const key = getPrivateKey(env);
  if (!key) return null;
  try {
    const canonical = JSON.stringify(data, Object.keys(data).sort());
    const signature = crypto.sign(null, Buffer.from(canonical), key);
    return {
      type: 'DataIntegrityProof',
      cryptosuite: 'eddsa-jcs-2022',
      verificationMethod: 'https://api.openprimitive.com/.well-known/opp.json#publicKey',
      created: new Date().toISOString(),
      proofValue: signature.toString('base64url'),
    };
  } catch (err) {
    console.error('Signing error:', err.message);
    return null;
  }
}

// x402 micropayments (activate by setting X402_PAY_TO env var)
let x402Middleware = null;
try {
  const { paymentMiddleware, x402ResourceServer } = require('@x402/hono');
  const { ExactEvmScheme } = require('@x402/evm/exact/server');
  const { HTTPFacilitatorClient } = require('@x402/core/server');

  x402Middleware = (payTo) => {
    const facilitatorClient = new HTTPFacilitatorClient({
      url: 'https://facilitator.x402.org',
    });
    const resourceServer = new x402ResourceServer(facilitatorClient)
      .register('eip155:8453', new ExactEvmScheme());

    return paymentMiddleware(
      {
        'GET /v1/eligible': {
          accepts: { scheme: 'exact', price: '$0.005', network: 'eip155:8453', payTo },
          description: 'Federal benefits eligibility check',
        },
        'GET /v1/compare': {
          accepts: { scheme: 'exact', price: '$0.003', network: 'eip155:8453', payTo },
          description: 'Cross-domain federal data comparison',
        },
        'GET /v1/risk': {
          accepts: { scheme: 'exact', price: '$0.003', network: 'eip155:8453', payTo },
          description: 'Cross-domain risk assessment by ZIP',
        },
        'GET /v1/location': {
          accepts: { scheme: 'exact', price: '$0.003', network: 'eip155:8453', payTo },
          description: 'Complete location profile by ZIP',
        },
      },
      resourceServer,
    );
  };
} catch (e) {
  // x402 packages not available — all endpoints free
}

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
const drugInteractions = require('../sources/drug-interactions');
const clinicalTrials = require('../sources/clinical-trials');
const earthquakes = require('../sources/earthquakes');
const spending = require('../sources/spending');
const dailymed = require('../sources/dailymed');
const meat = require('../sources/meat');

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
  meat:      (q) => q.q || q.est,
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

// ─── Archive helper ───

const SKIP_ARCHIVE = new Set(['/v1/stats', '/v1/status', '/ping', '/v1', '/v1/history', '/v1/changes', '/v1/snapshot-status']);

async function simpleHash(str) {
  try {
    const encoded = new TextEncoder().encode(str);
    // Use globalThis.crypto for Web Crypto API — require('crypto') is Node's module
    const buf = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    const arr = new Uint8Array(buf);
    let hex = '';
    for (let i = 0; i < 8; i++) hex += arr[i].toString(16).padStart(2, '0');
    return hex;
  } catch (err) {
    console.error('[archive] simpleHash failed:', err.message || err);
    // Fallback: timestamp-based hex
    return Date.now().toString(16);
  }
}

async function archiveToRedis(env, domain, url, data) {
  console.log('[archive] START — domain:', domain, 'url:', url);
  try {
    console.log('[archive] env keys available:', env ? Object.keys(env).filter(k => k.includes('UPSTASH') || k.includes('REDIS')).join(', ') || 'none matching UPSTASH/REDIS' : 'env is falsy');
    const r = getHistoryRedis(env);
    if (!r) {
      console.error('[archive] getHistoryRedis returned null — Redis not configured');
      return;
    }
    console.log('[archive] Redis client obtained');
    const date = new Date().toISOString().slice(0, 10);
    const hash = await simpleHash(url + Date.now());
    console.log('[archive] hash computed:', hash);
    const key = `archive:${domain}:${date}:${hash}`;
    const value = JSON.stringify({
      query: url,
      data,
      timestamp: new Date().toISOString(),
      domain,
    });
    console.log('[archive] writing key:', key, 'value length:', value.length);
    const result = await r.set(key, value, { ex: 31536000 });
    console.log('[archive] SUCCESS — set result:', result);
  } catch (err) {
    console.error('[archive] FAILED:', err.message || err);
    console.error('[archive] stack:', err.stack || 'no stack');
  }
}

// ─── Wrap helper ───

async function wrap(c, promise) {
  try {
    const data = await promise;
    if (data && data.error) return c.json(data, 400);
    const proof = signResponse(data, c.env);
    if (proof) data.proof = proof;
    const pathname = new URL(c.req.url).pathname;
    if (!SKIP_ARCHIVE.has(pathname)) {
      const match = pathname.match(/^\/v1\/(\w+)/);
      if (match) {
        c.executionCtx.waitUntil(archiveToRedis(c.env, match[1], c.req.url, data));
      }
    }
    return c.json(data);
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Internal server error' }, 500);
  }
}

// ─── x402 MICROPAYMENTS (optional — activate with X402_PAY_TO secret) ───
// When active, /v1/eligible, /v1/compare, /v1/risk, /v1/location require payment
// All other endpoints remain free
if (x402Middleware && typeof process !== 'undefined' && process.env && process.env.X402_PAY_TO) {
  app.use(x402Middleware(process.env.X402_PAY_TO));
}

// ─── PING ───
app.get('/ping', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── META ───
app.get('/v1', (c) => {
  return c.json({
    name: 'Open Primitive API',
    version: '1.0.0',
    description: 'Federal data for agents. 21 domains, one API.',
    domains: {
      flights: { endpoint: '/v1/flights', source: 'FAA NAS + Open-Meteo', description: 'Live airline delays and hub weather for 8 US carriers' },
      cars: { endpoint: '/v1/cars?year=&make=&model=', source: 'NHTSA', description: 'Crash safety ratings and recalls for any US vehicle' },
      food: { endpoint: '/v1/food', source: 'FDA Enforcement', description: 'Active food recalls and search by product or brand' },
      water: { endpoint: '/v1/water?zip=', source: 'EPA SDWIS', description: 'Drinking water systems and violations by ZIP code' },
      drugs: { endpoint: '/v1/drugs?name=', source: 'FDA FAERS', description: 'Drug adverse events, reactions, and label warnings' },
      'drug-labels': { endpoint: '/v1/drug-labels?name=metformin', source: 'NLM DailyMed', description: 'FDA-approved drug labeling: warnings, interactions, contraindications, adverse reactions' },
      'drug-interactions': { endpoint: '/v1/drug-interactions?drug1=aspirin&drug2=warfarin', source: 'FDA Drug Labels', description: 'Drug interaction check between any two medications via FDA label cross-reference' },
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
      context: { endpoint: '/v1/context?entity=zip:10001', source: 'Archive', description: 'Agent memory: query history and change detection for any entity across all domains' },
      'clinical-trials': { endpoint: '/v1/clinical-trials?q=diabetes', source: 'ClinicalTrials.gov', description: 'Search clinical trials by condition or intervention' },
      earthquakes: { endpoint: '/v1/earthquakes', source: 'USGS', description: 'Earthquakes in the last 24 hours, magnitude 2.5+' },
      spending: { endpoint: '/v1/spending?q=defense', source: 'USAspending.gov', description: 'Federal awards and contracts by keyword' },
      meat: { endpoint: '/v1/meat', source: 'USDA FSIS', description: 'Meat, poultry, egg product recalls and FSIS-inspected establishment data' },
      changes: { endpoint: '/v1/changes?date=2026-03-22', source: 'Archive', description: 'Daily change detection: what changed overnight across all federal domains' },
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

// ─── DRUG LABELS (DailyMed) ───
app.get('/v1/drug-labels', (c) => {
  const id = c.req.query('id');
  if (id) return wrap(c, dailymed.getLabelSections(id));
  return wrap(c, dailymed.searchLabels(c.req.query('name')));
});

// ─── DRUG INTERACTIONS ───
app.get('/v1/drug-interactions', (c) => wrap(c, drugInteractions.checkInteractions(c.req.query('drug1'), c.req.query('drug2'))));

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

// ─── CLINICAL TRIALS ───
app.get('/v1/clinical-trials', (c) => wrap(c, clinicalTrials.searchTrials(c.req.query('q'))));

// ─── EARTHQUAKES ───
app.get('/v1/earthquakes', (c) => wrap(c, earthquakes.getRecent()));

// ─── SPENDING ───
app.get('/v1/spending', (c) => wrap(c, spending.searchSpending(c.req.query('q'))));

// ─── MEAT (FSIS) ───
app.get('/v1/meat', (c) => {
  const q = c.req.query('q');
  const est = c.req.query('est');
  if (est) return wrap(c, meat.getEstablishment(est));
  if (q) return wrap(c, meat.search(q));
  return wrap(c, meat.getRecent());
});

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

// ─── REGISTRY ───

const HARDCODED_PROVIDERS = [{
  url: 'https://api.openprimitive.com',
  name: 'Open Primitive',
  domains: ['flights','cars','food','water','drugs','drug-labels','drug-interactions','hospitals','health','nutrition','jobs','demographics','products','sec','safety','weather','location','compare','ask','risk','eligible','air','clinical-trials','earthquakes','spending','meat'],
  lastVerified: '2026-03-21T00:00:00Z',
  status: 'active',
}];

let _registryRedis = null;
function getRegistryRedis(env) {
  if (_registryRedis) return _registryRedis;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { Redis } = require('@upstash/redis');
  _registryRedis = new Redis({ url, token });
  return _registryRedis;
}

async function registryHashUrl(url) {
  const encoded = new TextEncoder().encode(url);
  const buf = await crypto.subtle.digest('SHA-256', encoded);
  const arr = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < 8; i++) hex += arr[i].toString(16).padStart(2, '0');
  return hex;
}

async function getAllProviders(env) {
  const r = getRegistryRedis(env);
  if (r) {
    try {
      const keys = await r.keys('registry:*');
      if (keys.length > 0) {
        const values = await Promise.all(keys.map(k => r.get(k)));
        const providers = values.map(v => (typeof v === 'string' ? JSON.parse(v) : v)).filter(Boolean);
        if (providers.length > 0) return providers;
      }
    } catch (err) {
      console.error('Registry Redis error:', err.message);
    }
  }
  return HARDCODED_PROVIDERS;
}

app.get('/v1/registry', async (c) => {
  try {
    let providers = await getAllProviders(c.env);
    const domain = c.req.query('domain');
    const search = c.req.query('search');

    if (domain) {
      providers = providers.filter(p => p.domains.some(d => d.toLowerCase() === domain.toLowerCase()));
    }
    if (search) {
      const q = search.toLowerCase();
      providers = providers.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.domains.some(d => d.toLowerCase().includes(q))
      );
    }

    return c.json({ providers, count: providers.length });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Registry lookup failed' }, 500);
  }
});

app.post('/v1/registry/register', async (c) => {
  try {
    const body = await c.req.json();
    const { url } = body || {};
    if (!url) return c.json({ error: 'url is required' }, 400);

    const baseUrl = url.replace(/\/+$/, '');
    const manifestUrl = `${baseUrl}/.well-known/opp.json`;

    let manifest;
    try {
      const resp = await fetch(manifestUrl, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) {
        return c.json({ error: `Failed to fetch manifest: HTTP ${resp.status}` }, 400);
      }
      manifest = await resp.json();
    } catch (err) {
      return c.json({ error: `Could not reach ${manifestUrl}: ${err.message}` }, 400);
    }

    const requiredFields = ['name', 'version', 'domains'];
    for (const field of requiredFields) {
      if (!manifest[field]) {
        return c.json({ error: `Invalid OPP manifest: Missing required field: ${field}` }, 400);
      }
    }
    if (!Array.isArray(manifest.domains) || manifest.domains.length === 0) {
      return c.json({ error: 'Invalid OPP manifest: domains must be a non-empty array' }, 400);
    }

    const domainNames = manifest.domains.map(d => (typeof d === 'string' ? d : d.name || d.id));
    const entry = {
      url: baseUrl,
      name: manifest.name,
      domains: domainNames,
      lastVerified: new Date().toISOString(),
      status: 'active',
    };

    const r = getRegistryRedis(c.env);
    if (r) {
      const hash = await registryHashUrl(baseUrl);
      const key = `registry:${hash}`;
      await r.set(key, JSON.stringify(entry));
    }

    return c.json({ registered: true, provider: entry.name, domains: entry.domains });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Registration failed' }, 500);
  }
});

app.get('/v1/registry/search', async (c) => {
  try {
    const q = c.req.query('q');
    if (!q) return c.json({ error: 'q parameter is required' }, 400);

    const terms = q.toLowerCase().split(/\s+/);
    const providers = await getAllProviders(c.env);

    const scored = providers.map(p => {
      const haystack = [p.name, p.url, ...p.domains].join(' ').toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (haystack.includes(term)) score++;
        if (p.domains.some(d => d.toLowerCase() === term)) score += 2;
      }
      return { ...p, score };
    });

    const results = scored
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ score, ...rest }) => rest);

    return c.json({ results, count: results.length, query: q });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Search failed' }, 500);
  }
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

// ─── ARCHIVE TEST ───
app.get('/v1/archive-test', async (c) => {
  const steps = [];
  try {
    steps.push('1. checking env vars');
    const url = c.env.UPSTASH_REDIS_REST_URL;
    const token = c.env.UPSTASH_REDIS_REST_TOKEN;
    steps.push(`2. URL: ${url ? url.substring(0, 30) + '...' : 'MISSING'}`);
    steps.push(`3. TOKEN: ${token ? token.substring(0, 8) + '...' : 'MISSING'}`);
    if (!url || !token) return c.json({ ok: false, steps, error: 'Redis env vars missing' }, 503);

    steps.push('4. importing @upstash/redis');
    const { Redis } = require('@upstash/redis');
    steps.push('5. import succeeded');

    steps.push('6. creating client');
    const r = new Redis({ url, token });
    steps.push('7. client created');

    steps.push('8. writing test key');
    const testKey = `archive-test:${Date.now()}`;
    await r.set(testKey, JSON.stringify({ test: true, ts: new Date().toISOString() }), { ex: 60 });
    steps.push('9. write succeeded');

    steps.push('10. reading test key back');
    const val = await r.get(testKey);
    steps.push(`11. read result: ${JSON.stringify(val)}`);

    steps.push('12. testing simpleHash');
    const hash = await simpleHash('test' + Date.now());
    steps.push(`13. hash: ${hash}`);

    steps.push('14. cleaning up test key');
    await r.del(testKey);

    return c.json({ ok: true, steps });
  } catch (err) {
    steps.push(`ERROR: ${err.message}`);
    steps.push(`STACK: ${err.stack}`);
    return c.json({ ok: false, steps, error: err.message }, 500);
  }
});

// ─── HISTORY ───
let _historyRedis = null;
function getHistoryRedis(env) {
  if (_historyRedis) {
    console.log('[archive] returning cached Redis client');
    return _historyRedis;
  }
  console.log('[archive] getHistoryRedis — building new client');
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  console.log('[archive] UPSTASH_REDIS_REST_URL:', url ? url.substring(0, 30) + '...' : 'MISSING');
  console.log('[archive] UPSTASH_REDIS_REST_TOKEN:', token ? token.substring(0, 8) + '...' : 'MISSING');
  if (!url || !token) {
    console.error('[archive] Redis env vars missing — cannot create client');
    return null;
  }
  try {
    const { Redis } = require('@upstash/redis');
    console.log('[archive] @upstash/redis imported successfully');
    _historyRedis = new Redis({ url, token });
    console.log('[archive] Redis client created');
    return _historyRedis;
  } catch (err) {
    console.error('[archive] Failed to import/create @upstash/redis:', err.message || err);
    return null;
  }
}

app.get('/v1/history', async (c) => {
  const domain = c.req.query('domain');
  const date = c.req.query('date');
  if (!domain || !date) {
    return c.json({ error: 'Provide ?domain= and ?date= (YYYY-MM-DD)' }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  }

  const r = getHistoryRedis(c.env);
  if (!r) {
    return c.json({ error: 'Archive storage unavailable. Redis not configured.' }, 503);
  }

  const MAX_RESULTS = 50;
  const TIMEOUT_MS = 5000;
  const pattern = `archive:${domain}:${date}:*`;

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Redis scan timed out')), TIMEOUT_MS)
  );

  const scan = (async () => {
    const keys = [];
    let cursor = 0;
    do {
      const result = await r.scan(cursor, { match: pattern, count: 100 });
      cursor = result[0];
      keys.push(...result[1]);
      if (keys.length >= MAX_RESULTS) break;
    } while (cursor !== 0 && cursor !== '0');
    return keys.slice(0, MAX_RESULTS);
  })();

  try {
    const keys = await Promise.race([scan, timeout]);
    if (!keys.length) {
      return c.json({ domain, date, records: [], count: 0 });
    }

    const raw = await Promise.all(keys.map((k) => r.get(k)));
    const records = raw
      .map((val) => {
        if (!val) return null;
        try {
          const rec = typeof val === 'string' ? JSON.parse(val) : val;
          return { query: rec.query, data: rec.data, timestamp: rec.timestamp };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);

    return c.json({ domain, date, records, count: records.length });
  } catch (err) {
    return c.json({ error: err.message || 'Archive retrieval failed' }, 504);
  }
});

// ─── CONTEXT (Agent Memory) ───

// Entity format: "domain:value" e.g. "zip:10001", "drug:aspirin", "hospital:050454"
// Maps entity types to archive domains and how to match them in archived query URLs
const ENTITY_DOMAIN_MAP = {
  zip: ['water', 'safety', 'demographics', 'weather', 'location', 'risk', 'air'],
  drug: ['drugs'],
  hospital: ['hospitals'],
  food: ['food'],
  car: ['cars'],
};

function extractEntityFromQuery(queryUrl, entityType, entityValue) {
  if (!queryUrl) return false;
  const lower = queryUrl.toLowerCase();
  const val = entityValue.toLowerCase();
  // Check if the entity value appears in the query URL
  if (entityType === 'zip') return lower.includes(`zip=${val}`);
  if (entityType === 'drug') return lower.includes(`name=${val}`) || lower.includes(`q=${val}`);
  if (entityType === 'hospital') return lower.includes(`id=${val}`) || lower.includes(`q=${val}`);
  if (entityType === 'food') return lower.includes(`q=${val}`);
  if (entityType === 'car') return lower.includes(`make=${val}`) || lower.includes(`model=${val}`);
  return lower.includes(val);
}

function diffRecords(oldest, newest) {
  const changes = [];
  if (!oldest || !newest) return changes;

  function walk(oldObj, newObj, prefix) {
    if (!oldObj || !newObj || typeof oldObj !== 'object' || typeof newObj !== 'object') return;
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    for (const key of allKeys) {
      const path = prefix ? `${prefix}.${key}` : key;
      const oldVal = oldObj[key];
      const newVal = newObj[key];
      // Skip metadata fields
      if (['domain', 'timestamp', 'proof', 'query'].includes(key)) continue;
      if (typeof oldVal === 'number' && typeof newVal === 'number' && oldVal !== newVal) {
        let direction = newVal > oldVal ? 'increased' : 'decreased';
        // Heuristic: fields with "violation", "recall", "mortality", "readmission" worsening = up
        if (/violation|recall|mortality|readmission|adverse|complaint/i.test(path)) {
          direction = newVal > oldVal ? 'worse' : 'better';
        } else if (/rating|score|quality/i.test(path)) {
          direction = newVal > oldVal ? 'better' : 'worse';
        }
        changes.push({ field: path, was: oldVal, now: newVal, direction });
      } else if (typeof oldVal === 'string' && typeof newVal === 'string' && oldVal !== newVal) {
        changes.push({ field: path, was: oldVal, now: newVal, direction: 'changed' });
      } else if (typeof oldVal === 'object' && typeof newVal === 'object' && !Array.isArray(oldVal)) {
        walk(oldVal, newVal, path);
      }
    }
  }

  walk(oldest, newest, '');
  return changes.slice(0, 20); // Cap at 20 changes
}

function buildSummary(entity, count, firstSeen, changes) {
  const since = new Date(firstSeen).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  let summary = `${entity}: ${count} ${count === 1 ? 'query' : 'queries'} since ${since}.`;
  if (changes.length > 0) {
    const top = changes.slice(0, 3).map(ch =>
      `${ch.field} ${ch.direction} from ${ch.was} to ${ch.now}`
    ).join('; ');
    summary += ` ${top}.`;
  } else {
    summary += ' No changes detected.';
  }
  return summary;
}

app.get('/v1/context', async (c) => {
  const entity = c.req.query('entity');
  if (!entity || !entity.includes(':')) {
    return c.json({ error: 'Provide ?entity= in format type:value (e.g. zip:10001, drug:aspirin)' }, 400);
  }

  const [entityType, ...valueParts] = entity.split(':');
  const entityValue = valueParts.join(':');
  if (!entityValue) {
    return c.json({ error: 'Entity value is empty. Use format type:value' }, 400);
  }

  const domains = ENTITY_DOMAIN_MAP[entityType];
  if (!domains) {
    return c.json({
      error: `Unknown entity type: ${entityType}. Supported: ${Object.keys(ENTITY_DOMAIN_MAP).join(', ')}`,
    }, 400);
  }

  const r = getHistoryRedis(c.env);
  if (!r) {
    return c.json({ error: 'Archive storage unavailable. Redis not configured.' }, 503);
  }

  try {
    // Scan archive keys across all relevant domains
    const allRecords = [];
    const TIMEOUT_MS = 8000;

    for (const domain of domains) {
      const pattern = `archive:${domain}:*`;
      let cursor = 0;
      const keys = [];
      const scanStart = Date.now();

      do {
        if (Date.now() - scanStart > TIMEOUT_MS) break;
        const result = await r.scan(cursor, { match: pattern, count: 100 });
        cursor = result[0];
        keys.push(...result[1]);
        if (keys.length >= 200) break;
      } while (cursor !== 0 && cursor !== '0');

      if (keys.length === 0) continue;

      // Fetch values and filter for matching entity
      const batchSize = 50;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        const values = await Promise.all(batch.map(k => r.get(k)));
        for (const val of values) {
          if (!val) continue;
          const rec = typeof val === 'string' ? JSON.parse(val) : val;
          if (extractEntityFromQuery(rec.query, entityType, entityValue)) {
            allRecords.push(rec);
          }
        }
      }
    }

    if (allRecords.length === 0) {
      return c.json({
        domain: 'context',
        entity,
        firstSeen: null,
        lastSeen: null,
        queriedCount: 0,
        changes: [],
        summary: `No archived queries found for ${entity}.`,
      });
    }

    // Sort by timestamp
    allRecords.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const oldest = allRecords[0];
    const newest = allRecords[allRecords.length - 1];
    const changes = allRecords.length > 1 ? diffRecords(oldest.data, newest.data) : [];

    const result = {
      domain: 'context',
      entity,
      firstSeen: oldest.timestamp,
      lastSeen: newest.timestamp,
      queriedCount: allRecords.length,
      changes,
      summary: buildSummary(entity, allRecords.length, oldest.timestamp, changes),
    };

    const proof = signResponse(result, c.env);
    if (proof) result.proof = proof;

    return c.json(result);
  } catch (err) {
    console.error('[context]', err);
    return c.json({ error: 'Context retrieval failed: ' + (err.message || 'unknown error') }, 500);
  }
});

// ─── CHANGES (daily change detection) ───

const CHANGE_DOMAINS = {
  food: {
    extract: (records) => {
      const recalls = [];
      for (const rec of records) {
        const d = rec.data;
        if (d && d.recalls && Array.isArray(d.recalls)) {
          for (const r of d.recalls) recalls.push(r.recall_number || r.product_description || JSON.stringify(r).substring(0, 80));
        }
        if (d && d.results && Array.isArray(d.results)) {
          for (const r of d.results) recalls.push(r.recall_number || r.product_description || JSON.stringify(r).substring(0, 80));
        }
      }
      return new Set(recalls);
    },
    compare: (todaySet, yesterdaySet) => {
      const newItems = [...todaySet].filter(x => !yesterdaySet.has(x));
      if (newItems.length === 0) return null;
      return { domain: 'food', type: 'new_recall', summary: `${newItems.length} new food recall${newItems.length === 1 ? '' : 's'} since yesterday`, severity: newItems.length >= 3 ? 'high' : 'medium' };
    },
  },
  drugs: {
    extract: (records) => {
      let total = 0;
      for (const rec of records) {
        const d = rec.data;
        if (d && typeof d.total_adverse_events === 'number') total = Math.max(total, d.total_adverse_events);
        if (d && d.adverse_events && typeof d.adverse_events.total === 'number') total = Math.max(total, d.adverse_events.total);
      }
      return total;
    },
    compare: (todayVal, yesterdayVal) => {
      if (!todayVal || !yesterdayVal) return null;
      const diff = todayVal - yesterdayVal;
      if (diff === 0) return null;
      return { domain: 'drugs', type: 'adverse_events_change', summary: `Total adverse events ${diff > 0 ? 'increased' : 'decreased'} by ${Math.abs(diff)}`, severity: Math.abs(diff) > 100 ? 'high' : 'low' };
    },
  },
  water: {
    extract: (records) => {
      const violations = [];
      for (const rec of records) {
        const d = rec.data;
        if (d && d.violations && Array.isArray(d.violations)) {
          for (const v of d.violations) violations.push(v.violation_id || v.violation_type_code || JSON.stringify(v).substring(0, 80));
        }
      }
      return new Set(violations);
    },
    compare: (todaySet, yesterdaySet) => {
      const newItems = [...todaySet].filter(x => !yesterdaySet.has(x));
      if (newItems.length === 0) return null;
      return { domain: 'water', type: 'new_violation', summary: `${newItems.length} new water violation${newItems.length === 1 ? '' : 's'} since yesterday`, severity: newItems.length >= 3 ? 'high' : 'medium' };
    },
  },
  products: {
    extract: (records) => {
      const recalls = [];
      for (const rec of records) {
        const d = rec.data;
        if (d && d.recalls && Array.isArray(d.recalls)) {
          for (const r of d.recalls) recalls.push(r.recall_id || r.RecallID || r.title || JSON.stringify(r).substring(0, 80));
        }
        if (d && d.results && Array.isArray(d.results)) {
          for (const r of d.results) recalls.push(r.recall_id || r.RecallID || r.title || JSON.stringify(r).substring(0, 80));
        }
      }
      return new Set(recalls);
    },
    compare: (todaySet, yesterdaySet) => {
      const newItems = [...todaySet].filter(x => !yesterdaySet.has(x));
      if (newItems.length === 0) return null;
      return { domain: 'products', type: 'new_recall', summary: `${newItems.length} new product recall${newItems.length === 1 ? '' : 's'} since yesterday`, severity: newItems.length >= 3 ? 'high' : 'medium' };
    },
  },
  earthquakes: {
    extract: (records) => {
      const significant = [];
      for (const rec of records) {
        const d = rec.data;
        const quakes = d && d.earthquakes ? d.earthquakes : (d && d.features ? d.features : []);
        for (const q of quakes) {
          const mag = q.magnitude || (q.properties && q.properties.mag) || 0;
          const place = q.place || (q.properties && q.properties.place) || 'unknown location';
          if (mag >= 5) significant.push({ mag, place });
        }
      }
      return significant;
    },
    compare: (todayQuakes, yesterdayQuakes) => {
      if (todayQuakes.length === 0) return null;
      const yesterdayPlaces = new Set(yesterdayQuakes.map(q => q.place));
      const newQuakes = todayQuakes.filter(q => !yesterdayPlaces.has(q.place));
      if (newQuakes.length === 0) return null;
      const top = newQuakes.sort((a, b) => b.mag - a.mag)[0];
      return { domain: 'earthquakes', type: 'significant_event', summary: `M${top.mag} earthquake near ${top.place}${newQuakes.length > 1 ? ` and ${newQuakes.length - 1} more` : ''}`, severity: top.mag >= 6 ? 'high' : 'medium' };
    },
  },
  jobs: {
    extract: (records) => {
      for (const rec of records) {
        const d = rec.data;
        if (d && typeof d.unemployment_rate === 'number') return d.unemployment_rate;
        if (d && d.rate !== undefined) return d.rate;
      }
      return null;
    },
    compare: (todayRate, yesterdayRate) => {
      if (todayRate === null || yesterdayRate === null) return null;
      const diff = todayRate - yesterdayRate;
      if (diff === 0) return null;
      return { domain: 'jobs', type: 'rate_change', summary: `Unemployment rate ${diff > 0 ? 'rose' : 'fell'} from ${yesterdayRate}% to ${todayRate}%`, severity: Math.abs(diff) >= 0.3 ? 'high' : 'low' };
    },
  },
};

async function fetchArchiveRecords(r, domain, date) {
  const pattern = `archive:${domain}:${date}:*`;
  const keys = [];
  let cursor = 0;
  const start = Date.now();
  do {
    if (Date.now() - start > 5000) break;
    const result = await r.scan(cursor, { match: pattern, count: 100 });
    cursor = result[0];
    keys.push(...result[1]);
    if (keys.length >= 100) break;
  } while (cursor !== 0 && cursor !== '0');

  if (keys.length === 0) return [];

  const values = await Promise.all(keys.slice(0, 100).map(k => r.get(k)));
  return values.map(val => {
    if (!val) return null;
    try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return null; }
  }).filter(Boolean);
}

app.get('/v1/changes', async (c) => {
  const dateParam = c.req.query('date');
  const date = dateParam || new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  }

  const yesterday = new Date(date + 'T00:00:00Z');
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const r = getHistoryRedis(c.env);
  if (!r) {
    return c.json({ error: 'Archive storage unavailable. Redis not configured.' }, 503);
  }

  try {
    const changes = [];

    for (const [domain, handler] of Object.entries(CHANGE_DOMAINS)) {
      try {
        const [todayRecords, yesterdayRecords] = await Promise.all([
          fetchArchiveRecords(r, domain, date),
          fetchArchiveRecords(r, domain, yesterdayStr),
        ]);

        if (todayRecords.length === 0 && yesterdayRecords.length === 0) continue;

        const todayData = handler.extract(todayRecords);
        const yesterdayData = handler.extract(yesterdayRecords);
        const change = handler.compare(todayData, yesterdayData);
        if (change) changes.push(change);
      } catch (err) {
        console.error(`[changes] ${domain} failed:`, err.message);
      }
    }

    const result = {
      domain: 'changes',
      date,
      compared_to: yesterdayStr,
      changes,
      total_changes: changes.length,
      summary: changes.length === 0
        ? 'No significant changes detected.'
        : `${changes.length} significant change${changes.length === 1 ? '' : 's'} detected across federal data.`,
    };

    const proof = signResponse(result, c.env);
    if (proof) result.proof = proof;

    return c.json(result);
  } catch (err) {
    console.error('[changes]', err);
    return c.json({ error: 'Change detection failed: ' + (err.message || 'unknown error') }, 500);
  }
});

// ─── PROTOCOL STATUS ───

const OPP_IMPLEMENTATIONS = [
  { url: 'api.openprimitive.com', label: 'API hub', internal: true },
  { url: 'cars.openprimitive.com', label: 'Cars', internal: true },
  { url: 'water.openprimitive.com', label: 'Water', internal: true },
  { url: 'drugs.openprimitive.com', label: 'Drugs', internal: true },
  { url: 'food.openprimitive.com', label: 'Food', internal: true },
  { url: 'hospitals.openprimitive.com', label: 'Hospitals', internal: true },
  { url: 'health.openprimitive.com', label: 'Health', internal: true },
];

const OPP_REQUIRED_FIELDS = ['name', 'version', 'domains'];

async function checkOppManifest(url) {
  const manifestUrl = `https://${url}/.well-known/opp.json`;
  try {
    const resp = await fetch(manifestUrl, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return { url, status: 'unreachable', level: 0, domains: 0 };
    const manifest = await resp.json();
    const hasRequired = OPP_REQUIRED_FIELDS.every(f => !!manifest[f]);
    if (!hasRequired) return { url, status: 'invalid', level: 0, domains: 0 };
    const domainCount = Array.isArray(manifest.domains) ? manifest.domains.length : 0;
    // Level: 1 = manifest exists, 2 = valid manifest, 3 = has signing/federation
    let level = 2;
    if (manifest.publicKey || manifest.federation || manifest.signing) level = 3;
    return { url, status: 'live', level, domains: domainCount };
  } catch {
    return { url, status: 'unreachable', level: 0, domains: 0 };
  }
}

app.get('/v1/protocol-status', async (c) => {
  try {
    const checks = OPP_IMPLEMENTATIONS.map(impl => checkOppManifest(impl.url));

    let registryProviders = [];
    try {
      const allProviders = await getAllProviders(c.env);
      for (const p of allProviders) {
        const host = p.url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
        const alreadyKnown = OPP_IMPLEMENTATIONS.some(i => i.url === host);
        if (!alreadyKnown) {
          registryProviders.push({ url: host, label: p.name, internal: false });
          checks.push(checkOppManifest(host));
        }
      }
    } catch { /* registry unavailable */ }

    const results = await Promise.all(checks);
    const total = results.filter(r => r.status === 'live').length;
    const external = results.filter((r, i) => {
      const impl = i < OPP_IMPLEMENTATIONS.length
        ? OPP_IMPLEMENTATIONS[i]
        : registryProviders[i - OPP_IMPLEMENTATIONS.length];
      return r.status === 'live' && impl && !impl.internal;
    }).length;

    let adoption = 'pre-launch';
    if (external >= 10) adoption = 'growing';
    if (external >= 50) adoption = 'established';

    return c.json({
      domain: 'protocol-status',
      implementations: results,
      total,
      external,
      summary: `${total} OPP implementation${total === 1 ? '' : 's'} live. ${external} external (${external === 0 ? 'all Open Primitive' : external + ' third-party'}). Protocol adoption: ${adoption}.`,
    });
  } catch (err) {
    console.error('[protocol-status]', err);
    return c.json({ error: 'Protocol status check failed' }, 500);
  }
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

// ─── SNAPSHOT DOMAINS (comprehensive daily archive) ───

const SNAPSHOT_DOMAINS = [
  // Parameterless endpoints
  { name: 'food', url: '/v1/food' },
  { name: 'products', url: '/v1/products' },
  { name: 'jobs', url: '/v1/jobs' },
  { name: 'flights', url: '/v1/flights' },
  { name: 'earthquakes', url: '/v1/earthquakes' },
  { name: 'meat', url: '/v1/meat' },
  // ZIP-based domains for major metro areas
  { name: 'water-10001', url: '/v1/water?zip=10001' },
  { name: 'water-90210', url: '/v1/water?zip=90210' },
  { name: 'water-60601', url: '/v1/water?zip=60601' },
  { name: 'water-77001', url: '/v1/water?zip=77001' },
  { name: 'water-48201', url: '/v1/water?zip=48201' },
  { name: 'demographics-10001', url: '/v1/demographics?zip=10001' },
  { name: 'demographics-90210', url: '/v1/demographics?zip=90210' },
  { name: 'safety-10001', url: '/v1/safety?zip=10001' },
  { name: 'safety-90210', url: '/v1/safety?zip=90210' },
  { name: 'eligible-30000-4-CA', url: '/v1/eligible?income=30000&household=4&state=CA' },
  { name: 'eligible-45000-3-TX', url: '/v1/eligible?income=45000&household=3&state=TX' },
  { name: 'drugs-aspirin', url: '/v1/drugs?name=aspirin' },
  { name: 'drugs-metformin', url: '/v1/drugs?name=metformin' },
  { name: 'drugs-ibuprofen', url: '/v1/drugs?name=ibuprofen' },
];

// In-memory snapshot status (resets on deploy, but Redis persists the real data)
let lastSnapshotRun = null;
let lastSnapshotResults = [];

// ─── SNAPSHOT STATUS ───
app.get('/v1/snapshot-status', async (c) => {
  // Try Redis first (survives deploys), fall back to in-memory
  let persisted = null;
  try {
    const r = getHistoryRedis(c.env);
    if (r) {
      const raw = await r.get('snapshot:last-run');
      if (raw) persisted = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
  } catch (err) {
    // Redis unavailable — use in-memory
  }

  return c.json({
    domain: 'snapshot-status',
    lastRun: persisted ? persisted.timestamp : lastSnapshotRun,
    snapshotCount: SNAPSHOT_DOMAINS.length,
    domains: SNAPSHOT_DOMAINS.map(d => d.name),
    results: persisted ? persisted.results : lastSnapshotResults,
    archived: persisted ? persisted.archived : lastSnapshotResults.filter(r => r.status === 'archived').length,
    failed: persisted ? persisted.failed : lastSnapshotResults.filter(r => r.status === 'failed').length,
  });
});

// Cron trigger for daily archive ingestion
// Hits our own endpoints, which triggers the archive middleware to write to Redis.
export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    const BASE = 'https://api.openprimitive.com';
    const results = [];

    for (const d of SNAPSHOT_DOMAINS) {
      try {
        const res = await fetch(BASE + d.url);
        if (res.ok) results.push({ domain: d.name, status: 'archived' });
        else results.push({ domain: d.name, status: 'failed', error: `HTTP ${res.status}` });
      } catch (e) {
        results.push({ domain: d.name, status: 'failed', error: e.message });
      }
    }

    lastSnapshotRun = new Date().toISOString();
    lastSnapshotResults = results;

    // Also persist last-run timestamp to Redis so it survives deploys
    try {
      const r = getHistoryRedis(env);
      if (r) {
        await r.set('snapshot:last-run', JSON.stringify({
          timestamp: lastSnapshotRun,
          results,
          count: results.length,
          archived: results.filter(r => r.status === 'archived').length,
          failed: results.filter(r => r.status === 'failed').length,
        }), { ex: 604800 }); // keep 7 days
      }
    } catch (err) {
      console.error('[snapshot] Redis persist failed:', err.message);
    }

    console.log(`[snapshot] ${results.filter(r => r.status === 'archived').length}/${results.length} archived at ${lastSnapshotRun}`);
  },
};
