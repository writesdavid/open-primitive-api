const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

let redis = null;

function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

function hashDomain(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
}

const HARDCODED_PROVIDERS = [
  {
    url: 'https://api.openprimitive.com',
    name: 'Open Primitive',
    domains: [
      'flights', 'cars', 'food', 'water', 'drugs', 'hospitals',
      'health', 'nutrition', 'jobs', 'demographics', 'products',
      'sec', 'safety', 'weather', 'location', 'compare', 'ask',
    ],
    lastVerified: '2026-03-19T00:00:00Z',
    status: 'active',
  },
];

const REQUIRED_MANIFEST_FIELDS = ['name', 'version', 'domains'];

function validateManifest(manifest) {
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!manifest[field]) return { valid: false, reason: `Missing required field: ${field}` };
  }
  if (!Array.isArray(manifest.domains) || manifest.domains.length === 0) {
    return { valid: false, reason: 'domains must be a non-empty array' };
  }
  return { valid: true };
}

async function registerProvider(req, res) {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });

  // Normalize URL — strip trailing slash
  const baseUrl = url.replace(/\/+$/, '');
  const manifestUrl = `${baseUrl}/.well-known/opp.json`;

  let manifest;
  try {
    const fetch = require('node-fetch');
    const resp = await fetch(manifestUrl, { timeout: 10000 });
    if (!resp.ok) {
      return res.status(400).json({ error: `Failed to fetch manifest: HTTP ${resp.status}` });
    }
    manifest = await resp.json();
  } catch (err) {
    return res.status(400).json({ error: `Could not reach ${manifestUrl}: ${err.message}` });
  }

  const validation = validateManifest(manifest);
  if (!validation.valid) {
    return res.status(400).json({ error: `Invalid OPP manifest: ${validation.reason}` });
  }

  const domainNames = manifest.domains.map(d => (typeof d === 'string' ? d : d.name || d.id));

  const entry = {
    url: baseUrl,
    name: manifest.name,
    domains: domainNames,
    lastVerified: new Date().toISOString(),
    status: 'active',
  };

  const r = getRedis();
  if (r) {
    const key = `registry:${hashDomain(baseUrl)}`;
    await r.set(key, JSON.stringify(entry));
  }

  res.json({ registered: true, provider: entry.name, domains: entry.domains });
}

async function listProviders(req, res) {
  const { domain, search } = req.query;
  let providers = [];

  const r = getRedis();
  if (r) {
    try {
      const keys = await r.keys('registry:*');
      if (keys.length > 0) {
        const values = await Promise.all(keys.map(k => r.get(k)));
        providers = values.map(v => (typeof v === 'string' ? JSON.parse(v) : v)).filter(Boolean);
      }
    } catch (err) {
      console.error('Registry Redis error:', err.message);
    }
  }

  // Fall back to hardcoded if Redis empty or unavailable
  if (providers.length === 0) {
    providers = HARDCODED_PROVIDERS;
  }

  // Filter by domain
  if (domain) {
    providers = providers.filter(p => p.domains.some(d => d.toLowerCase() === domain.toLowerCase()));
  }

  // Text search across name and domains
  if (search) {
    const q = search.toLowerCase();
    providers = providers.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.domains.some(d => d.toLowerCase().includes(q))
    );
  }

  res.json({ providers, count: providers.length });
}

async function searchProviders(req, res) {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter is required' });

  const terms = q.toLowerCase().split(/\s+/);
  let providers = [];

  const r = getRedis();
  if (r) {
    try {
      const keys = await r.keys('registry:*');
      if (keys.length > 0) {
        const values = await Promise.all(keys.map(k => r.get(k)));
        providers = values.map(v => (typeof v === 'string' ? JSON.parse(v) : v)).filter(Boolean);
      }
    } catch (err) {
      console.error('Registry Redis error:', err.message);
    }
  }

  if (providers.length === 0) {
    providers = HARDCODED_PROVIDERS;
  }

  // Score each provider by how many search terms match
  const scored = providers.map(p => {
    const haystack = [p.name, p.url, ...p.domains].join(' ').toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term)) score++;
      // Bonus for exact domain match
      if (p.domains.some(d => d.toLowerCase() === term)) score += 2;
    }
    return { ...p, score };
  });

  const results = scored
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ score, ...rest }) => rest);

  res.json({ results, count: results.length, query: q });
}

module.exports = { registerProvider, listProviders, searchProviders };
