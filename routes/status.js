const fetch = require('node-fetch');

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 60 seconds

const checks = [
  { domain: 'flights', source: 'FAA NAS', url: 'https://nasstatus.faa.gov/api/airport-status-information', method: 'GET' },
  { domain: 'cars', source: 'NHTSA', url: 'https://api.nhtsa.gov/SafetyRatings/modelyear/2024?format=json', method: 'GET' },
  { domain: 'food', source: 'FDA Enforcement', url: 'https://api.fda.gov/food/enforcement.json?limit=1', method: 'GET' },
  { domain: 'water', source: 'EPA SDWIS', url: 'https://enviro.epa.gov/efservice/WATER_SYSTEM/ZIP_CODE/10001/JSON', method: 'GET' },
  { domain: 'drugs', source: 'FDA FAERS', url: 'https://api.fda.gov/drug/event.json?limit=1', method: 'GET' },
  { domain: 'hospitals', source: 'CMS Care Compare', url: 'https://data.cms.gov', method: 'HEAD' },
  { domain: 'health', source: 'PubMed/MEDLINE', url: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&term=test&retmax=1', method: 'GET' },
  { domain: 'nutrition', source: 'USDA FoodData Central', url: 'https://api.nal.usda.gov/fdc/v1/foods/search?query=test&pageSize=1&api_key=DEMO_KEY', method: 'GET' },
  { domain: 'jobs', source: 'Bureau of Labor Statistics', url: 'https://api.bls.gov/publicAPI/v2/timeseries/data/', method: 'POST', body: JSON.stringify({ seriesid: ['LNS14000000'], startyear: '2024', endyear: '2024' }) },
  { domain: 'demographics', source: 'US Census ACS', url: 'https://api.census.gov/data/2023/acs/acs5?get=NAME&for=zip%20code%20tabulation%20area:10001', method: 'GET' },
  { domain: 'products', source: 'CPSC', url: 'https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallNumber=1', method: 'GET' },
  { domain: 'sec', source: 'SEC EDGAR', url: 'https://efts.sec.gov/LATEST/search-index?q=test&from=0&size=1', method: 'GET' },
  { domain: 'safety', source: 'Composite', url: null, method: null },
];

async function checkOne(check) {
  if (!check.url) {
    return { domain: check.domain, source: check.source, status: 'up', responseMs: 0, checkedAt: new Date().toISOString(), note: 'No upstream — composite endpoint' };
  }
  const start = Date.now();
  try {
    const opts = { method: check.method, timeout: 5000 };
    if (check.method === 'POST') {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = check.body;
    }
    if (check.domain === 'sec') {
      opts.headers = { ...(opts.headers || {}), 'User-Agent': 'open-primitive-status/1.0 (status@openprimitive.com)' };
    }
    const res = await fetch(check.url, opts);
    const ms = Date.now() - start;
    const status = res.ok ? (ms > 3000 ? 'slow' : 'up') : 'down';
    return { domain: check.domain, source: check.source, status, responseMs: ms, checkedAt: new Date().toISOString() };
  } catch (err) {
    const ms = Date.now() - start;
    return { domain: check.domain, source: check.source, status: 'down', responseMs: ms, checkedAt: new Date().toISOString(), error: err.message };
  }
}

async function getStatus() {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) return cache;
  const results = await Promise.all(checks.map(checkOne));
  cache = results;
  cacheTime = now;
  return results;
}

module.exports = { getStatus };
