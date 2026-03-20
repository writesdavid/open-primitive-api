const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { recordFetch, getAge, FRESHNESS_THRESHOLDS } = require('./freshness');

// ─── REDIS (lazy, single instance) ───

let redis = null;
function getRedis() {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = require('@upstash/redis');
    redis = new Redis({ url, token });
    return redis;
  } catch (e) {
    console.error('Response handler: Redis init failed', e.message);
    return null;
  }
}

// ─── TIMEOUT WRAPPER ───

const REDIS_TIMEOUT = 3000;

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis timeout')), REDIS_TIMEOUT)
    ),
  ]);
}

// ─── SIGNING (Ed25519) ───

let privateKey = null;
function loadPrivateKey() {
  if (privateKey) return privateKey;
  const keyPath = path.join(__dirname, '..', '.keys', 'private.pem');
  try {
    if (fs.existsSync(keyPath)) {
      const pem = fs.readFileSync(keyPath, 'utf8');
      privateKey = crypto.createPrivateKey(pem);
      return privateKey;
    }
  } catch {}
  if (process.env.OPP_PRIVATE_KEY) {
    privateKey = crypto.createPrivateKey(process.env.OPP_PRIVATE_KEY);
    return privateKey;
  }
  return null;
}

function signData(data) {
  const key = loadPrivateKey();
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

// ─── CITATIONS ───

const DOMAIN_TEMPLATES = {
  drugs: (data) => {
    const drug = data.drug || data.query || 'unknown';
    const total = data.totalEvents || data.total || 0;
    const top = (data.topReactions && data.topReactions[0] && data.topReactions[0].reaction) || 'unknown';
    return {
      statement: `According to FDA FAERS, ${drug} has ${total} reported adverse events, with ${top} as the most common`,
      source_name: 'FDA FAERS',
      source_url: 'https://api.fda.gov',
      license: 'US Government Public Domain',
    };
  },
  food: (data) => {
    const total = data.total || (data.recalls && data.recalls.length) || 0;
    return {
      statement: `According to FDA Enforcement, ${total} food recalls are currently active`,
      source_name: 'FDA Enforcement',
      source_url: 'https://api.fda.gov',
      license: 'US Government Public Domain',
    };
  },
  water: (data) => {
    const count = data.count || (data.systems && data.systems.length) || 0;
    const zip = data.zip || 'unknown';
    return {
      statement: `According to EPA SDWIS, ${count} water systems serve ZIP ${zip}`,
      source_name: 'EPA SDWIS',
      source_url: 'https://www.epa.gov/enviro/sdwis-search',
      license: 'US Government Public Domain',
    };
  },
  hospitals: (data) => {
    const count = data.count || (data.hospitals && data.hospitals.length) || 0;
    const query = data.query || data.q || 'the search area';
    return {
      statement: `According to CMS Care Compare, ${count} hospitals found for ${query}`,
      source_name: 'CMS Care Compare',
      source_url: 'https://data.cms.gov',
      license: 'US Government Public Domain',
    };
  },
  health: (data) => {
    const totalStudies = data.totalStudies || data.total || 0;
    const query = data.query || 'unknown';
    const evidence = data.evidence || data.evidenceLevel || 'unrated';
    return {
      statement: `According to PubMed, ${totalStudies} studies found for ${query}, evidence level: ${evidence}`,
      source_name: 'PubMed/MEDLINE',
      source_url: 'https://pubmed.ncbi.nlm.nih.gov',
      license: 'US Government Public Domain',
    };
  },
  safety: (data) => {
    const zip = data.zip || 'unknown';
    const score = data.safetyScore || data.score || 'N/A';
    return {
      statement: `According to EPA and CMS data, ZIP ${zip} has a safety score of ${score}/100`,
      source_name: 'EPA + CMS',
      source_url: 'https://www.epa.gov',
      license: 'US Government Public Domain',
    };
  },
  cars: (data) => {
    const count = data.recallCount || (data.recalls && data.recalls.length) || 0;
    const year = data.year || '';
    const make = data.make || '';
    const model = data.model || '';
    return {
      statement: `According to NHTSA, ${count} recalls found for ${year} ${make} ${model}`.trim(),
      source_name: 'NHTSA',
      source_url: 'https://api.nhtsa.gov',
      license: 'US Government Public Domain',
    };
  },
  flights: (data) => {
    const count = (data.airlines && data.airlines.length) || 1;
    return {
      statement: `According to FAA, ${count} airlines reporting delays`,
      source_name: 'FAA NAS',
      source_url: 'https://nasstatus.faa.gov',
      license: 'US Government Public Domain',
    };
  },
  nutrition: (data) => {
    const query = data.query || data.description || 'unknown';
    const calories = data.calories || (data.nutrients && data.nutrients.calories) || 'N/A';
    return {
      statement: `According to USDA, ${query} contains ${calories} calories per serving`,
      source_name: 'USDA FoodData Central',
      source_url: 'https://fdc.nal.usda.gov',
      license: 'US Government Public Domain',
    };
  },
  jobs: (data) => {
    const value = data.value || data.rate || 'N/A';
    return {
      statement: `According to BLS, current unemployment rate is ${value}%`,
      source_name: 'Bureau of Labor Statistics',
      source_url: 'https://api.bls.gov',
      license: 'US Government Public Domain',
    };
  },
  demographics: (data) => {
    const zip = data.zip || 'unknown';
    const pop = data.population || 'N/A';
    const income = data.medianIncome || data.median_income || 'N/A';
    return {
      statement: `According to US Census, ZIP ${zip} has population ${pop}, median income $${income}`,
      source_name: 'US Census ACS',
      source_url: 'https://api.census.gov',
      license: 'US Government Public Domain',
    };
  },
  products: (data) => {
    const total = data.total || (data.recalls && data.recalls.length) || 0;
    return {
      statement: `According to CPSC, ${total} product recalls in the last 90 days`,
      source_name: 'CPSC',
      source_url: 'https://www.saferproducts.gov',
      license: 'US Government Public Domain',
    };
  },
  sec: (data) => {
    const count = data.count || (data.filings && data.filings.length) || 0;
    const query = data.query || data.company || 'unknown';
    return {
      statement: `According to SEC EDGAR, ${count} filings found for ${query}`,
      source_name: 'SEC EDGAR',
      source_url: 'https://efts.sec.gov',
      license: 'US Government Public Domain',
    };
  },
  weather: (data) => {
    const zip = data.zip || 'unknown';
    const periods = (data.forecast && data.forecast.length) || 0;
    return {
      statement: `According to NOAA NWS, ${periods}-period forecast retrieved for ZIP ${zip}`,
      source_name: 'NOAA NWS',
      source_url: 'https://api.weather.gov',
      license: 'US Government Public Domain',
    };
  },
  location: (data) => {
    const zip = data.zip || 'unknown';
    return {
      statement: `According to Census, EPA, and CMS data, location profile compiled for ZIP ${zip}`,
      source_name: 'Census + EPA + CMS',
      source_url: 'https://api.census.gov',
      license: 'US Government Public Domain',
    };
  },
  compare: (data) => {
    const type = data.type || 'ZIP';
    const a = data.a || 'unknown';
    const b = data.b || 'unknown';
    return {
      statement: `Side-by-side ${type} comparison of ${a} vs ${b}`,
      source_name: 'Multiple Federal Sources',
      source_url: 'https://api.openprimitive.com',
      license: 'US Government Public Domain',
    };
  },
  ask: (data) => {
    const query = data.query || data.q || 'unknown';
    const domains = (data.domains && data.domains.join(', ')) || 'unknown';
    return {
      statement: `Query "${query}" routed to ${domains}`,
      source_name: 'Open Primitive',
      source_url: 'https://api.openprimitive.com',
      license: 'US Government Public Domain',
    };
  },
  alerts: (data) => {
    const count = data.count || (data.alerts && data.alerts.length) || 0;
    return {
      statement: `${count} active data alerts across federal sources`,
      source_name: 'Multiple Federal Sources',
      source_url: 'https://api.openprimitive.com',
      license: 'US Government Public Domain',
    };
  },
};

function getDomainFromPath(reqPath) {
  const match = reqPath.match(/^\/v1\/([a-z]+)/);
  return match ? match[1] : null;
}

function addCitation(body, domain, originalUrl) {
  const template = DOMAIN_TEMPLATES[domain];
  if (!template) return;
  try {
    const citation = template(body);
    const fullUrl = 'https://api.openprimitive.com' + originalUrl;
    body.citations = {
      statement: citation.statement,
      source_name: citation.source_name,
      source_url: citation.source_url,
      accessed: new Date().toISOString(),
      api_url: fullUrl,
      license: citation.license,
    };
  } catch {}
}

// ─── ARCHIVE (fire-and-forget) ───

function shortHash(str) {
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 8);
}

function archiveToRedis(req, body, domain) {
  const r = getRedis();
  if (!r) return;

  try {
    const date = new Date().toISOString().slice(0, 10);
    const queryStr = req.originalUrl.split('?')[1] || '';
    const hash = shortHash(req.path + '?' + queryStr);
    const key = `archive:${domain}:${date}:${hash}`;

    const record = {
      query: req.originalUrl,
      data: body,
      timestamp: new Date().toISOString(),
      domain,
    };

    withTimeout(r.set(key, JSON.stringify(record), { ex: 365 * 24 * 60 * 60 })).catch(() => {});
  } catch {}
}

// ─── METER (fire-and-forget) ───

function meterUsage(req) {
  if (!req.apiKey || req.apiKey === 'anonymous' || req.apiKey === 'dev') return;

  const r = getRedis();
  if (!r) return;

  const day = new Date().toISOString().slice(0, 10);
  const endpoint = req.route ? req.route.path : req.path;

  withTimeout(
    Promise.all([
      r.incr(`usage:${req.apiKey}:${day}`),
      r.incr(`usage:${req.apiKey}:${day}:${endpoint}`),
      r.incr(`usage:global:${day}`),
    ])
  ).catch(() => {});
}

// ─── THE SINGLE MIDDLEWARE ───

function responseHandler(req, res, next) {
  if (!req.path.startsWith('/v1/') && req.path !== '/v1') return next();
  // Skip stats/history — no enrichment needed
  if (req.path === '/v1/stats' || req.path === '/v1/history') return next();

  const originalJson = res.json.bind(res);

  res.json = function (body) {
    const domain = getDomainFromPath(req.path);
    const isSuccess = body && !body.error && res.statusCode < 400;

    // ── BEFORE sending: enrich the response ──

    if (isSuccess && domain) {
      // Citations
      addCitation(body, domain, req.originalUrl);

      // Signature (must come after citations so it signs the full payload)
      const proof = signData(body);
      if (proof) body.proof = proof;

      // Freshness header
      if (FRESHNESS_THRESHOLDS[domain]) {
        recordFetch(domain);
        const age = getAge(domain);
        res.set('X-Data-Freshness', age !== null ? String(age) : 'unknown');
        res.set('X-Data-Max-Age', String(FRESHNESS_THRESHOLDS[domain]));
      }
    }

    // ── Send the response to the client ──
    originalJson(body);

    // ── AFTER sending: fire-and-forget Redis work ──

    if (isSuccess && domain) {
      archiveToRedis(req, body, domain);
      meterUsage(req);
    }
  };

  next();
}

module.exports = { responseHandler };
