const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

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

const HARDCODED_PROVIDERS = [
  {
    url: 'https://api.openprimitive.com',
    name: 'Open Primitive',
    domains: [
      'flights', 'cars', 'food', 'water', 'drugs', 'hospitals',
      'health', 'nutrition', 'jobs', 'demographics', 'products',
      'sec', 'safety', 'weather', 'location', 'compare', 'ask',
    ],
    publicKey: null,
    lastVerified: '2026-03-19T00:00:00Z',
    status: 'active',
  },
];

// Domain-to-query-param mapping for self-hosted endpoints
const DOMAIN_PARAMS = {
  water: { param: 'zip', path: '/v1/water' },
  hospitals: { param: 'q', path: '/v1/hospitals', zipParam: 'q' },
  drugs: { param: 'name', path: '/v1/drugs' },
  food: { param: 'q', path: '/v1/food' },
  health: { param: 'q', path: '/v1/health' },
  demographics: { param: 'zip', path: '/v1/demographics' },
  safety: { param: 'zip', path: '/v1/safety' },
  weather: { param: 'zip', path: '/v1/weather' },
  nutrition: { param: 'q', path: '/v1/nutrition' },
  jobs: { param: null, path: '/v1/jobs' },
  products: { param: 'q', path: '/v1/products' },
  sec: { param: 'q', path: '/v1/sec' },
  location: { param: 'zip', path: '/v1/location' },
  flights: { param: null, path: '/v1/flights' },
  cars: { param: null, path: '/v1/cars' },
  compare: { param: null, path: '/v1/compare' },
  ask: { param: 'q', path: '/v1/ask' },
};

async function getProviders() {
  const r = getRedis();
  if (r) {
    try {
      const keys = await r.keys('registry:*');
      if (keys.length > 0) {
        const values = await Promise.all(keys.map(k => r.get(k)));
        const parsed = values.map(v => (typeof v === 'string' ? JSON.parse(v) : v)).filter(Boolean);
        if (parsed.length > 0) return parsed;
      }
    } catch (err) {
      console.error('Federation registry error:', err.message);
    }
  }
  return HARDCODED_PROVIDERS;
}

function verifyEd25519Proof(data, proof, publicKeyBase64) {
  if (!proof || !publicKeyBase64) return null;
  try {
    const key = crypto.createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const { proofValue, ...rest } = data;
    const canonical = JSON.stringify(rest);
    return crypto.verify(null, Buffer.from(canonical), key, Buffer.from(proof.proofValue, 'base64url'));
  } catch (err) {
    return false;
  }
}

function buildUrl(baseUrl, domain, params) {
  const config = DOMAIN_PARAMS[domain];
  if (!config) return null;

  const url = new URL(config.path, baseUrl);

  // Map the federated query params to domain-specific params
  if (params.zip && config.param === 'zip') {
    url.searchParams.set('zip', params.zip);
  } else if (params.zip && config.zipParam) {
    url.searchParams.set(config.zipParam, params.zip);
  } else if (params.q && config.param === 'q') {
    url.searchParams.set('q', params.q);
  } else if (params.q && config.param === 'name') {
    url.searchParams.set('name', params.q);
  } else if (params.zip && config.param === 'q') {
    // Some domains accept zip as a text query
    url.searchParams.set('q', params.zip);
  }

  return url.toString();
}

async function fetchProviderDomain(provider, domain, params) {
  const url = buildUrl(provider.url, domain, params);
  if (!url) {
    return {
      provider: provider.name,
      url: provider.url,
      domain,
      data: null,
      error: `Unknown domain: ${domain}`,
      freshness: null,
      verified: false,
    };
  }

  try {
    const fetch = require('node-fetch');
    const resp = await fetch(url, { timeout: 15000 });
    if (!resp.ok) {
      return {
        provider: provider.name,
        url: provider.url,
        domain,
        data: null,
        error: `HTTP ${resp.status}`,
        freshness: null,
        verified: false,
      };
    }

    const data = await resp.json();
    const freshness = data.freshness || data.timestamp || new Date().toISOString();

    // Verify Ed25519 proof if present
    let verified = false;
    if (data.proof && provider.publicKey) {
      verified = verifyEd25519Proof(data, data.proof, provider.publicKey) === true;
    } else if (provider.url === 'https://api.openprimitive.com') {
      // Self-signed data from our own API — trusted
      verified = true;
    }

    return {
      provider: provider.name,
      url: provider.url,
      domain,
      data,
      freshness,
      verified,
    };
  } catch (err) {
    return {
      provider: provider.name,
      url: provider.url,
      domain,
      data: null,
      error: err.message,
      freshness: null,
      verified: false,
    };
  }
}

async function federatedQuery(query) {
  const { domains, zip, q } = query;

  if (!domains) {
    return { error: 'domains parameter is required (comma-separated list)' };
  }

  const domainList = domains.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
  if (domainList.length === 0) {
    return { error: 'At least one domain is required' };
  }

  const params = {};
  if (zip) params.zip = zip;
  if (q) params.q = q;

  // Determine the join key
  const joinedBy = zip ? 'zip' : q ? 'query' : 'none';

  // Find all providers that cover the requested domains
  const allProviders = await getProviders();
  const fetches = [];

  for (const domain of domainList) {
    const matchingProviders = allProviders.filter(
      p => p.status === 'active' && p.domains.some(d => d.toLowerCase() === domain)
    );

    for (const provider of matchingProviders) {
      fetches.push(fetchProviderDomain(provider, domain, params));
    }

    // If no provider covers this domain, note it
    if (matchingProviders.length === 0) {
      fetches.push(Promise.resolve({
        provider: null,
        url: null,
        domain,
        data: null,
        error: 'No registered provider covers this domain',
        freshness: null,
        verified: false,
      }));
    }
  }

  const results = await Promise.all(fetches);

  const providerNames = new Set(results.filter(r => r.provider).map(r => r.provider));
  const successCount = results.filter(r => r.data).length;

  return {
    domain: 'federated',
    query: { domains: domainList, ...(zip ? { zip } : {}), ...(q ? { q } : {}) },
    freshness: new Date().toISOString(),
    providers: results,
    joined_by: joinedBy,
    summary: `${providerNames.size} provider${providerNames.size !== 1 ? 's' : ''} returned data for ${zip ? `ZIP ${zip}` : q ? `query "${q}"` : 'request'} across ${domainList.length} domain${domainList.length !== 1 ? 's' : ''} (${successCount} succeeded)`,
  };
}

module.exports = { federatedQuery };
