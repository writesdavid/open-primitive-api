const express = require('express');
const path = require('path');
const { apiKeyAuth, rateLimitMiddleware, meterUsage } = require('./middleware/auth');

const flights = require('./sources/flights');
const cars = require('./sources/cars');
const food = require('./sources/food');
const water = require('./sources/water');
const drugs = require('./sources/drugs');
const hospitals = require('./sources/hospitals');
const health = require('./sources/health');

const app = express();

// Static docs page
app.use(express.static(path.join(__dirname, 'public')));

// CORS
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'X-API-Key, Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Auth + rate limit + meter on all /v1 routes
app.use('/v1', apiKeyAuth, rateLimitMiddleware, meterUsage);

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

// ─── META ───
app.get('/v1', (req, res) => {
  res.json({
    name: 'Open Primitive API',
    version: '1.0.0',
    description: 'Federal data for agents. 7 domains, one API.',
    domains: {
      flights: { endpoint: '/v1/flights', source: 'FAA NAS + Open-Meteo', description: 'Live airline delays and hub weather for 8 US carriers' },
      cars: { endpoint: '/v1/cars?year=&make=&model=', source: 'NHTSA', description: 'Crash safety ratings and recalls for any US vehicle' },
      food: { endpoint: '/v1/food', source: 'FDA Enforcement', description: 'Active food recalls and search by product or brand' },
      water: { endpoint: '/v1/water?zip=', source: 'EPA SDWIS', description: 'Drinking water systems and violations by ZIP code' },
      drugs: { endpoint: '/v1/drugs?name=', source: 'FDA FAERS', description: 'Drug adverse events, reactions, and label warnings' },
      hospitals: { endpoint: '/v1/hospitals?q=', source: 'CMS Care Compare', description: 'Hospital quality ratings, mortality, readmissions' },
      health: { endpoint: '/v1/health?q=', source: 'PubMed/MEDLINE', description: 'Research evidence for supplements and health claims' },
    },
    auth: 'Pass API key via X-API-Key header or ?api_key= query parameter',
    rateLimit: '200 requests per hour per key',
    mcp: 'MCP server available at /mcp or via stdio (node mcp.js)',
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
