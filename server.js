const express = require('express');
const path = require('path');
const { apiKeyAuth, rateLimitMiddleware, meterUsage } = require('./middleware/auth');
const { agentDetect, getStats } = require('./middleware/agent-detect');
const { archiveMiddleware, historyRoute } = require('./middleware/archive');
const { signingMiddleware } = require('./middleware/signing');

const flights = require('./sources/flights');
const cars = require('./sources/cars');
const food = require('./sources/food');
const water = require('./sources/water');
const drugs = require('./sources/drugs');
const hospitals = require('./sources/hospitals');
const health = require('./sources/health');
const safety = require('./sources/safety');
const nutrition = require('./sources/nutrition');
const jobs = require('./sources/jobs');
const demographics = require('./sources/demographics');
const products = require('./sources/products');
const sec = require('./sources/sec');
const weather = require('./sources/weather');
const location = require('./sources/location');
const compare = require('./sources/compare');
const { getStatus } = require('./routes/status');
const { handleRegister } = require('./routes/register');
const { registerProvider, listProviders, searchProviders } = require('./routes/registry');
const { addQualityGrade } = require('./middleware/quality');
const { citationMiddleware } = require('./middleware/citations');
const ask = require('./sources/ask');
const alerts = require('./sources/alerts');

const app = express();

// JSON body parsing for POST routes
app.use(express.json());

// Static docs page
app.use(express.static(path.join(__dirname, 'public')));

// CORS
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'X-API-Key, Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Agent detection on ALL requests
app.use(agentDetect);

// Auth + rate limit + meter on all /v1 routes
app.use('/v1', apiKeyAuth, rateLimitMiddleware, meterUsage);

// Archive every /v1/* response to Upstash Redis (fire-and-forget)
app.use(archiveMiddleware);

// Ed25519 response signing (runs before citations so citations get signed too)
app.use(signingMiddleware);

// Citation injection on all /v1/* responses
app.use(citationMiddleware);

// Response wrapper
function wrap(res, promise) {
  promise
    .then(data => {
      if (data && data.error) {
        return res.status(400).json(data);
      }
      res.json(data);
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    });
}

// ─── FLIGHTS ───
app.get('/v1/flights', (req, res) => wrap(res, flights.getAirlines()));
app.get('/v1/flights/:iata', (req, res) => wrap(res, flights.getAirline(req.params.iata)));

// ─── CARS ───
app.get('/v1/cars', (req, res) => wrap(res, cars.getSafety(req.query.year, req.query.make, req.query.model)));

// ─── FOOD ───
app.get('/v1/food', (req, res) => {
  if (req.query.q) return wrap(res, food.search(req.query.q));
  wrap(res, food.getRecent());
});

// ─── WATER ───
app.get('/v1/water', (req, res) => wrap(res, water.searchByZip(req.query.zip)));
app.get('/v1/water/:pwsid', (req, res) => wrap(res, water.getSystem(req.params.pwsid)));

// ─── DRUGS ───
app.get('/v1/drugs', (req, res) => wrap(res, drugs.getDrug(req.query.name)));

// ─── HOSPITALS ───
app.get('/v1/hospitals', (req, res) => {
  if (req.query.id) return wrap(res, hospitals.getHospital(req.query.id));
  wrap(res, hospitals.searchHospitals(req.query.q));
});

// ─── HEALTH ───
app.get('/v1/health', (req, res) => wrap(res, health.searchHealth(req.query.q)));

// ─── SAFETY (cross-domain) ───
app.get('/v1/safety', (req, res) => wrap(res, safety.getSafetyProfile(req.query.zip)));

// ─── NUTRITION ───
app.get('/v1/nutrition', (req, res) => {
  if (req.query.id) return wrap(res, nutrition.getFood(req.query.id));
  wrap(res, nutrition.searchFood(req.query.q));
});

// ─── JOBS ───
app.get('/v1/jobs', (req, res) => {
  if (req.query.series) return wrap(res, jobs.getSeriesData(req.query.series));
  wrap(res, jobs.getUnemployment());
});

// ─── DEMOGRAPHICS ───
app.get('/v1/demographics', (req, res) => wrap(res, demographics.getByZip(req.query.zip)));

// ─── PRODUCTS ───
app.get('/v1/products', (req, res) => {
  if (req.query.q) return wrap(res, products.search(req.query.q));
  wrap(res, products.getRecent());
});

// ─── SEC ───
app.get('/v1/sec', (req, res) => {
  if (req.query.cik) return wrap(res, sec.getCompanyFacts(req.query.cik));
  wrap(res, sec.searchCompany(req.query.q));
});

// ─── WEATHER ───
app.get('/v1/weather', (req, res) => {
  if (req.query.state) return wrap(res, weather.getAlerts(req.query.state));
  wrap(res, weather.getForecastByZip(req.query.zip));
});

// ─── LOCATION (cross-domain profile) ───
app.get('/v1/location', (req, res) => wrap(res, location.getLocationProfile(req.query.zip)));

// ─── COMPARE ───
app.get('/v1/compare', (req, res) => {
  const { type, a, b } = req.query;
  if (type === 'drugs') return wrap(res, compare.compareDrugs(a, b));
  if (type === 'hospitals') return wrap(res, compare.compareHospitals(a, b));
  wrap(res, compare.compareZips(a, b));
});

// ─── ASK (natural language query router) ───
app.get('/v1/ask', (req, res) => wrap(res, ask.askQuestion(req.query.q)));

// ─── ALERTS (proactive data feed for agents) ───
app.get('/v1/alerts', (req, res) => wrap(res, alerts.getAlertFeed()));

// ─── REGISTER (self-service API key) ───
app.post('/v1/register', handleRegister);

// ─── REGISTRY (provider discovery) ───
app.post('/v1/registry/register', registerProvider);
app.get('/v1/registry/search', searchProviders);
app.get('/v1/registry', listProviders);

// ─── META ───
app.get('/v1', (req, res) => {
  res.json({
    name: 'Open Primitive API',
    version: '1.0.0',
    description: 'Federal data for agents. 16 domains, one API.',
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
    },
    auth: 'Pass API key via X-API-Key header or ?api_key= query parameter',
    rateLimit: '200 requests per hour per key',
    mcp: 'MCP server available at /mcp or via stdio (node mcp.js)',
  });
});

// ─── ALERTS (agent feed — poll or webhook) ───
app.get('/v1/alerts', (req, res) => wrap(res, alerts.getAlertFeed()));
app.post('/v1/alerts/check', (req, res) => wrap(res, alerts.checkForAlerts()));

// ─── HISTORY (placeholder — retrieval layer comes later) ───
app.get('/v1/history', historyRoute);

// ─── STATS (public — no auth, this is the viral page data) ───
app.get('/v1/stats', (req, res) => {
  const stats = getStats();
  const pct = stats.total > 0 ? Math.round((stats.agent / stats.total) * 100) : 0;
  // Transform objects to arrays for the dashboard
  const agents = Object.entries(stats.byAgent).map(([name, count]) => ({ name, count }));
  const endpoints = Object.entries(stats.byEndpoint).map(([name, data]) => ({
    name,
    count: (data.agent || 0) + (data.human || 0),
    agent: data.agent || 0,
    human: data.human || 0,
  }));
  res.json({
    agentPercent: pct,
    total: stats.total,
    agent: stats.agent,
    human: stats.human,
    agents,
    endpoints,
    byAgent: stats.byAgent,
    byEndpoint: stats.byEndpoint,
    hourly: stats.hourly,
    upSince: stats.upSince,
  });
});

// ─── STATUS ───
app.get('/v1/status', (req, res) => {
  getStatus()
    .then(data => res.json(data))
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: 'Status check failed' });
    });
});

// Health check
app.get('/ping', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Vercel export
module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3010;
  app.listen(port, () => console.log(`Open Primitive API running on port ${port}`));
}
