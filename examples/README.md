# OPP Provider Examples

This directory contains example OPP provider implementations. Any data source can become an OPP provider in under 100 lines of code.

## World Bank Provider

A standalone Express server that wraps the World Bank Open Data API in the OPP envelope format (Level 2 provider — no signing).

### Run it

```
npm install express node-fetch@2
node world-bank-provider.js
```

### Endpoints

**GET /.well-known/opp.json** — Provider manifest.

**GET /v1/indicators?country=US&indicator=GDP** — Fetch indicator data for a country. Returns the most recent 5 years.

Built-in indicator shortcuts: GDP, GNI, POPULATION, LIFE_EXPECTANCY, CO2. You can also pass raw World Bank indicator codes (e.g. `NY.GDP.MKTP.CD`).

### Response format

Every response follows the OPP envelope:

```json
{
  "domain": "indicators",
  "source": "World Bank Open Data",
  "source_url": "https://api.worldbank.org/v2/...",
  "freshness": "2026-03-19T...",
  "confidence": 0.95,
  "citations": [{ "title": "World Bank Open Data", "url": "https://data.worldbank.org" }],
  "query": { "country": "US", "indicator": "GDP" },
  "data": [{ "year": "2023", "value": 27360935000000, "unit": null }]
}
```
