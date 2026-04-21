/**
 * intent.js — Intent layer (Layer 3) for Open Primitive Protocol
 *
 * An intent is a machine-readable expression of what a person wants,
 * submitted by their agent. Not a search query — a GOAL with constraints.
 *
 * The agent parses the goal, determines which data domains to query,
 * runs them in parallel, assembles the answer, and scores confidence.
 *
 * Redis keys:
 *   intent:{intentId}         — hash of intent object
 *   intents:agent:{agentId}   — sorted set of intentIds by creation time
 */

const { Redis } = require('@upstash/redis');

// ---------------------------------------------------------------------------
// Redis client
// ---------------------------------------------------------------------------

let _redis = null;
function getRedis(env) {
  if (_redis) return _redis;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
  _redis = new Redis({ url, token });
  return _redis;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOMAIN_TIMEOUT_MS = 10000;

// Keyword-to-domain mapping for goal parsing
const DOMAIN_KEYWORDS = {
  water:            ['water', 'drinking', 'contamination', 'contaminant', 'lead', 'pfas', 'fluoride', 'pwsid'],
  air:              ['air', 'aqi', 'pollution', 'particulate', 'ozone', 'smog', 'emissions'],
  weather:          ['weather', 'forecast', 'temperature', 'rain', 'snow', 'storm', 'hurricane', 'tornado'],
  demographics:     ['demographics', 'population', 'income', 'poverty', 'census', 'household', 'median', 'family', 'families'],
  hospitals:        ['hospital', 'hospitals', 'healthcare', 'medical', 'emergency', 'clinic', 'er'],
  earthquakes:      ['earthquake', 'seismic', 'quake', 'tremor', 'fault'],
  location:         ['location', 'neighborhood', 'area', 'region', 'city', 'town'],
  eligible:         ['eligible', 'eligibility', 'benefits', 'assistance', 'welfare', 'snap', 'medicaid'],
  sec:              ['sec', 'securities', 'filing', 'stock', 'ticker', 'company', 'corporate', 'investor'],
  drugs:            ['drug', 'drugs', 'medication', 'pharmaceutical', 'adverse', 'fda', 'prescription', 'rx'],
  clinicalTrials:   ['clinical', 'trial', 'trials', 'study', 'studies', 'experimental'],
  drugInteractions: ['interaction', 'interactions', 'contraindication'],
  dailymed:         ['label', 'labeling', 'dailymed', 'package', 'insert'],
  food:             ['food', 'recall', 'enforcement', 'contamination', 'salmonella', 'listeria'],
  products:         ['product', 'products', 'consumer', 'cpsc', 'recall', 'hazard'],
  spending:         ['spending', 'budget', 'federal', 'grants', 'contracts'],
  health:           ['health', 'disease', 'condition', 'symptom', 'mortality', 'morbidity'],
  jobs:             ['jobs', 'employment', 'unemployment', 'labor', 'workforce', 'hiring', 'salary', 'wage'],
  safety:           ['safety', 'crime', 'violent', 'property crime', 'safe', 'safest', 'dangerous'],
  nutrition:        ['nutrition', 'calories', 'nutrients', 'vitamin', 'dietary'],
  cars:             ['car', 'cars', 'vehicle', 'auto', 'automobile', 'nhtsa', 'crash'],
  flights:          ['flight', 'flights', 'airline', 'airport', 'aviation'],
  courts:           ['court', 'courts', 'legal', 'opinion', 'docket', 'judge', 'ruling', 'lawsuit'],
  federalRegister:  ['regulation', 'rulemaking', 'federal register', 'proposed rule'],
  education:        ['school', 'schools', 'education', 'college', 'university', 'enrollment', 'tuition'],
  infrastructure:   ['infrastructure', 'electricity', 'energy', 'gas', 'broadband', 'internet', 'utility', 'utilities'],
  meat:             ['meat', 'slaughter', 'usda', 'inspection'],
  risk:             ['risk', 'hazard', 'vulnerability'],
};

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateIntentId() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `opp_i_${ts}${rand}`;
}

// ---------------------------------------------------------------------------
// Goal parsing — extract relevant domains from natural language
// ---------------------------------------------------------------------------

function parseGoalDomains(goal, constraintDomains) {
  // If constraints explicitly list domains, use those
  if (constraintDomains && constraintDomains.length > 0) {
    return constraintDomains;
  }

  // Otherwise, keyword-match against the goal
  const lower = goal.toLowerCase();
  const matched = [];

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        if (!matched.includes(domain)) matched.push(domain);
        break;
      }
    }
  }

  // Default to a broad set if nothing matched
  if (matched.length === 0) {
    return ['location', 'demographics', 'health', 'safety'];
  }

  return matched;
}

// ---------------------------------------------------------------------------
// Timeout wrapper
// ---------------------------------------------------------------------------

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// ---------------------------------------------------------------------------
// Domain query dispatcher
// ---------------------------------------------------------------------------

function buildDomainQuery(domain, constraints, sourceModules) {
  const mod = sourceModules[domain];
  if (!mod) return null;

  const geo = constraints.geography || {};
  const zip = geo.zip || null;
  const state = geo.state || null;
  const coords = geo.coords || null;

  // Map domain to the correct function call with available geography
  const dispatchers = {
    water:            () => zip ? mod.searchByZip(zip) : null,
    air:              () => zip ? mod.getAirQuality(zip) : null,
    weather:          () => coords ? mod.getForecast(coords[0], coords[1]) : zip ? mod.getForecastByZip(zip) : null,
    demographics:     () => zip ? mod.getByZip(zip) : null,
    hospitals:        () => zip ? mod.searchHospitals(zip) : null,
    earthquakes:      () => mod.getRecent(),
    location:         () => zip ? mod.getLocationProfile(zip) : null,
    eligible:         () => mod.checkEligibility(geo),
    sec:              () => null, // needs company identifier, not geographic
    drugs:            () => null, // needs drug name
    clinicalTrials:   () => null, // needs query
    drugInteractions: () => null, // needs drug names
    dailymed:         () => null, // needs drug name
    food:             () => null, // needs query
    products:         () => null, // needs query
    spending:         () => null, // needs query
    health:           () => null, // needs query
    jobs:             () => state ? mod.searchJobs({ state }) : null,
    safety:           () => zip ? mod.getSafetyProfile(zip) : null,
    nutrition:        () => null, // needs food item
    cars:             () => null, // needs make/model
    flights:          () => null, // needs IATA
    courts:           () => null, // needs query
    federalRegister:  () => null, // needs query
    education:        () => zip ? mod.searchSchools({ zip }) : state ? mod.searchSchools({ state }) : null,
    infrastructure:   () => state ? mod.getElectricityPrice({ state }) : zip ? mod.getBroadband({ zip }) : null,
    meat:             () => null, // needs query
    risk:             () => zip ? mod.getRiskProfile(zip) : null,
  };

  const fn = dispatchers[domain];
  return fn ? fn() : null;
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

function computeConfidence(domainResults) {
  const entries = Object.values(domainResults);
  const successCount = entries.filter((r) => r.status === 'ok' && r.data != null).length;
  const totalCount = entries.length;
  if (totalCount === 0) return 0;
  const base = successCount / totalCount;
  const corroborating = Math.max(0, successCount - 1);
  return Math.min(1, parseFloat((base * (1 + 0.1 * corroborating)).toFixed(3)));
}

// ---------------------------------------------------------------------------
// submitIntent
// ---------------------------------------------------------------------------

async function submitIntent(env, { agentId, goal, constraints }) {
  if (!agentId) throw new Error('agentId is required');
  if (!goal) throw new Error('goal is required');

  const redis = getRedis(env);
  const intentId = generateIntentId();
  const now = new Date().toISOString();

  const intent = {
    intentId,
    agentId,
    goal,
    constraints: {
      domains: (constraints && constraints.domains) || [],
      geography: (constraints && constraints.geography) || {},
      timeframe: (constraints && constraints.timeframe) || 'now',
      priority: (constraints && constraints.priority) || 'thoroughness',
    },
    status: 'pending',
    resolution: null,
    created: now,
  };

  await redis.set(`intent:${intentId}`, JSON.stringify(intent));
  await redis.zadd(`intents:agent:${agentId}`, { score: Date.now(), member: intentId });

  return { intentId, status: 'pending' };
}

// ---------------------------------------------------------------------------
// resolveIntent — the brain
// ---------------------------------------------------------------------------

async function resolveIntent(env, intentId, sourceModules) {
  const redis = getRedis(env);
  const raw = await redis.get(`intent:${intentId}`);
  if (!raw) throw new Error('Intent not found');

  const intent = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (intent.status === 'resolved') {
    return { resolution: intent.resolution };
  }

  // Mark as processing
  intent.status = 'processing';
  await redis.set(`intent:${intentId}`, JSON.stringify(intent));

  // 1. Determine relevant domains
  const domains = parseGoalDomains(intent.goal, intent.constraints.domains);

  // 2. Query all relevant domains in parallel
  const domainResults = {};
  const started = Date.now();

  const queries = domains.map((domain) => {
    const promise = buildDomainQuery(domain, intent.constraints, sourceModules);
    if (!promise) {
      return Promise.resolve({ domain, status: 'skipped', data: null, reason: 'no query available for constraints' });
    }
    return withTimeout(promise, DOMAIN_TIMEOUT_MS)
      .then((data) => ({ domain, status: 'ok', data, latencyMs: Date.now() - started }))
      .catch((err) => ({
        domain,
        status: err.message === 'TIMEOUT' ? 'timeout' : 'error',
        error: err.message,
        latencyMs: Date.now() - started,
      }));
  });

  const settled = await Promise.allSettled(queries);

  for (const outcome of settled) {
    const val = outcome.status === 'fulfilled' ? outcome.value : {
      domain: 'unknown',
      status: 'error',
      error: outcome.reason?.message || 'Unknown error',
    };
    domainResults[val.domain] = val;
  }

  // 3. Assemble resolution
  const sources = Object.entries(domainResults)
    .filter(([, v]) => v.status === 'ok' && v.data != null)
    .map(([k]) => k);

  const confidence = computeConfidence(domainResults);
  const resolvedAt = new Date().toISOString();

  const resolution = {
    data: domainResults,
    sources,
    confidence,
    resolvedAt,
    totalMs: Date.now() - started,
    domainsQueried: domains.length,
    domainsResolved: sources.length,
  };

  // 4. Store
  intent.status = intent.constraints.timeframe === 'monitor' ? 'monitoring' : 'resolved';
  intent.resolution = resolution;
  await redis.set(`intent:${intentId}`, JSON.stringify(intent));

  return { resolution };
}

// ---------------------------------------------------------------------------
// getIntent
// ---------------------------------------------------------------------------

async function getIntent(env, intentId) {
  const redis = getRedis(env);
  const raw = await redis.get(`intent:${intentId}`);
  if (!raw) throw new Error('Intent not found');
  const intent = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return { intent };
}

// ---------------------------------------------------------------------------
// listIntents
// ---------------------------------------------------------------------------

async function listIntents(env, agentId) {
  const redis = getRedis(env);
  const ids = await redis.zrange(`intents:agent:${agentId}`, 0, -1, { rev: true });
  if (!ids || ids.length === 0) return { intents: [] };

  const intents = [];
  for (const id of ids) {
    const raw = await redis.get(`intent:${id}`);
    if (raw) {
      intents.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
    }
  }

  return { intents };
}

// ---------------------------------------------------------------------------
// cancelIntent
// ---------------------------------------------------------------------------

async function cancelIntent(env, intentId) {
  const redis = getRedis(env);
  const raw = await redis.get(`intent:${intentId}`);
  if (!raw) throw new Error('Intent not found');

  const intent = typeof raw === 'string' ? JSON.parse(raw) : raw;
  intent.status = 'cancelled';
  await redis.set(`intent:${intentId}`, JSON.stringify(intent));

  return { cancelled: true };
}

module.exports = { submitIntent, resolveIntent, getIntent, listIntents, cancelIntent, parseGoalDomains };
