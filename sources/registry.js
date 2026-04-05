const { Redis } = require('@upstash/redis');

let _redis = null;

function getRedis(env) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!_redis) _redis = new Redis({ url, token });
  return _redis;
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function providerKey(id) { return `registry:provider:${id}`; }
function domainKey(domain) { return `registry:domain:${domain}`; }
const INDEX_KEY = 'registry:index';
function healthKey(id) { return `registry:health:${id}`; }

function generateId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

// ---------------------------------------------------------------------------
// 1. Provider registration
// ---------------------------------------------------------------------------

async function registerProvider(env, provider) {
  const redis = getRedis(env);
  if (!redis) throw new Error('Redis not configured');

  const required = ['name', 'url', 'domains', 'publicKey', 'contact'];
  const missing = required.filter(f => !provider[f]);
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  if (!Array.isArray(provider.domains) || provider.domains.length === 0) {
    throw new Error('domains must be a non-empty array');
  }

  const id = generateId(provider.name);

  const record = {
    id,
    name: provider.name,
    url: provider.url,
    manifestUrl: provider.manifestUrl || `${provider.url}/.well-known/opp.json`,
    domains: provider.domains,
    entityTypes: provider.entityTypes || [],
    publicKey: provider.publicKey,
    license: provider.license || 'unknown',
    freshnessGuarantee: provider.freshnessGuarantee || 'unknown',
    contact: provider.contact,
    trustScore: 0.5, // default starting score
    status: 'active',
    registeredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const pipeline = redis.pipeline();

  // Store provider data
  pipeline.set(providerKey(id), JSON.stringify(record));

  // Add to global index
  pipeline.sadd(INDEX_KEY, id);

  // Add to each domain sorted set with initial trust score
  for (const domain of provider.domains) {
    pipeline.zadd(domainKey(domain.toLowerCase()), {
      score: record.trustScore,
      member: id,
    });
  }

  await pipeline.exec();

  return record;
}

// ---------------------------------------------------------------------------
// 2. Provider discovery
// ---------------------------------------------------------------------------

async function discoverProviders(env, { domain, entityType, minTrust, license } = {}) {
  const redis = getRedis(env);
  if (!redis) return [];

  if (!domain) throw new Error('domain is required');

  // Get provider IDs from domain sorted set, ordered by trust score descending
  const ids = await redis.zrange(domainKey(domain.toLowerCase()), 0, -1, { rev: true });
  if (!ids || ids.length === 0) return [];

  const providers = await Promise.all(ids.map(id => getProvider(env, id)));

  return providers.filter(p => {
    if (!p) return false;
    if (p.status !== 'active') return false;
    if (typeof minTrust === 'number' && p.trustScore < minTrust) return false;
    if (entityType && p.entityTypes.length > 0 && !p.entityTypes.includes(entityType)) return false;
    if (license && p.license !== license) return false;
    return true;
  });
}

async function getProvider(env, providerId) {
  const redis = getRedis(env);
  if (!redis) return null;
  const raw = await redis.get(providerKey(providerId));
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function listProviders(env, { domain, limit = 50, offset = 0 } = {}) {
  const redis = getRedis(env);
  if (!redis) return { providers: [], total: 0 };

  let ids;
  if (domain) {
    ids = await redis.zrange(domainKey(domain.toLowerCase()), 0, -1, { rev: true });
  } else {
    ids = await redis.smembers(INDEX_KEY);
  }

  if (!ids || ids.length === 0) return { providers: [], total: 0 };

  const total = ids.length;
  const page = ids.slice(offset, offset + limit);

  const providers = (await Promise.all(page.map(id => getProvider(env, id)))).filter(Boolean);

  return { providers, total, limit, offset };
}

// ---------------------------------------------------------------------------
// 3. Trust scoring
// ---------------------------------------------------------------------------

async function scoreProvider(env, providerId) {
  const redis = getRedis(env);
  if (!redis) throw new Error('Redis not configured');

  const provider = await getProvider(env, providerId);
  if (!provider) throw new Error(`Provider not found: ${providerId}`);

  // Fetch stored health data
  const raw = await redis.get(healthKey(providerId));
  const health = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;

  const factors = {
    uptime: 1.0,
    signatureValid: false,
    manifestPresent: false,
    freshnessAccurate: false,
    responseTime: 0,
    dataQuality: 0.5,
  };

  if (health) {
    factors.manifestPresent = health.manifestValid === true;
    factors.signatureValid = health.signatureValid === true;
    factors.responseTime = health.responseTimeMs || 0;
    factors.uptime = health.status === 'healthy' ? 1.0 : health.status === 'degraded' ? 0.5 : 0.0;
    factors.freshnessAccurate = health.freshnessAccurate === true;

    // Data quality: penalize slow responses (>2s), reward fast ones
    if (factors.responseTime > 0 && factors.responseTime < 500) {
      factors.dataQuality = 0.9;
    } else if (factors.responseTime < 2000) {
      factors.dataQuality = 0.7;
    } else {
      factors.dataQuality = 0.4;
    }
  }

  // Weighted trust score
  const weights = {
    uptime: 0.30,
    signatureValid: 0.25,
    manifestPresent: 0.15,
    freshnessAccurate: 0.15,
    dataQuality: 0.15,
  };

  const trustScore = Math.min(1.0, Math.max(0.0,
    (factors.uptime * weights.uptime) +
    ((factors.signatureValid ? 1.0 : 0.0) * weights.signatureValid) +
    ((factors.manifestPresent ? 1.0 : 0.0) * weights.manifestPresent) +
    ((factors.freshnessAccurate ? 1.0 : 0.0) * weights.freshnessAccurate) +
    (factors.dataQuality * weights.dataQuality)
  ));

  // Persist updated score
  provider.trustScore = Math.round(trustScore * 1000) / 1000;
  provider.updatedAt = new Date().toISOString();
  await redis.set(providerKey(providerId), JSON.stringify(provider));

  // Update domain sorted sets
  for (const domain of provider.domains) {
    await redis.zadd(domainKey(domain.toLowerCase()), {
      score: provider.trustScore,
      member: providerId,
    });
  }

  return { trustScore: provider.trustScore, factors };
}

// ---------------------------------------------------------------------------
// 4. Health checking
// ---------------------------------------------------------------------------

async function checkProviderHealth(env, providerId) {
  const redis = getRedis(env);
  if (!redis) throw new Error('Redis not configured');

  const provider = await getProvider(env, providerId);
  if (!provider) throw new Error(`Provider not found: ${providerId}`);

  const result = {
    providerId,
    status: 'down',
    manifestValid: false,
    signatureValid: false,
    freshnessAccurate: false,
    responseTimeMs: 0,
    lastChecked: new Date().toISOString(),
    errors: [],
  };

  const manifestUrl = provider.manifestUrl || `${provider.url}/.well-known/opp.json`;
  const start = Date.now();

  try {
    const resp = await fetch(manifestUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'OPP-Registry/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    result.responseTimeMs = Date.now() - start;

    if (!resp.ok) {
      result.errors.push(`Manifest fetch failed: HTTP ${resp.status}`);
      result.status = 'down';
    } else {
      const manifest = await resp.json();
      const validation = validateManifest(manifest);
      result.manifestValid = validation.valid;

      if (!validation.valid) {
        result.errors.push(...validation.errors);
      }

      // Check signature: verify publicKey in manifest matches registered key
      if (manifest.publicKey && provider.publicKey) {
        result.signatureValid = manifest.publicKey === provider.publicKey;
        if (!result.signatureValid) {
          result.errors.push('Public key in manifest does not match registered key');
        }
      }

      // Check freshness
      if (manifest.freshness && manifest.freshness.lastUpdated) {
        const lastUpdated = new Date(manifest.freshness.lastUpdated);
        const now = new Date();
        const ageMs = now - lastUpdated;
        const guarantee = provider.freshnessGuarantee || manifest.freshness.guarantee;

        const thresholds = {
          'real-time': 5 * 60 * 1000,       // 5 min
          'hourly': 2 * 60 * 60 * 1000,     // 2 hours
          'daily': 2 * 24 * 60 * 60 * 1000, // 2 days
          'weekly': 14 * 24 * 60 * 60 * 1000,
        };

        const threshold = thresholds[guarantee] || thresholds['daily'];
        result.freshnessAccurate = ageMs <= threshold;
      }

      // Determine overall status
      if (result.manifestValid && result.responseTimeMs < 5000) {
        result.status = result.signatureValid ? 'healthy' : 'degraded';
      } else if (result.responseTimeMs < 10000) {
        result.status = 'degraded';
      } else {
        result.status = 'down';
      }
    }
  } catch (err) {
    result.responseTimeMs = Date.now() - start;
    result.errors.push(err.message);
    result.status = 'down';
  }

  // Store health record
  await redis.set(healthKey(providerId), JSON.stringify(result));

  // Re-score after health check
  await scoreProvider(env, providerId);

  return result;
}

// ---------------------------------------------------------------------------
// 5. Federated query routing
// ---------------------------------------------------------------------------

async function routeQuery(env, { domain, entityType, query } = {}) {
  if (!domain) throw new Error('domain is required');

  const providers = await discoverProviders(env, { domain, entityType, minTrust: 0.1 });

  if (providers.length === 0) {
    return {
      primaryProvider: null,
      fallbackProviders: [],
      routingBasis: 'no providers found for this domain',
    };
  }

  // Sort by trust score descending (should already be sorted, but ensure)
  providers.sort((a, b) => (b.trustScore || 0) - (a.trustScore || 0));

  const primary = providers[0];
  const fallbacks = providers.slice(1, 4); // up to 3 fallbacks

  return {
    primaryProvider: {
      id: primary.id,
      url: primary.url,
      trustScore: primary.trustScore,
      entityTypes: primary.entityTypes,
    },
    fallbackProviders: fallbacks.map(p => ({
      id: p.id,
      url: p.url,
      trustScore: p.trustScore,
      entityTypes: p.entityTypes,
    })),
    routingBasis: 'highest trust score with matching entity type',
    query: query || null,
  };
}

// ---------------------------------------------------------------------------
// 6. OPP manifest validation
// ---------------------------------------------------------------------------

function validateManifest(manifest) {
  const errors = [];
  const warnings = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest is not a valid JSON object'], warnings: [], oppLevel: 0 };
  }

  // Level 1: basic fields
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Missing or invalid "name" field');
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('Missing or invalid "version" field');
  }
  if (!Array.isArray(manifest.domains) || manifest.domains.length === 0) {
    errors.push('Missing or empty "domains" array');
  }
  if (!Array.isArray(manifest.endpoints) || manifest.endpoints.length === 0) {
    errors.push('Missing or empty "endpoints" array');
  } else {
    for (let i = 0; i < manifest.endpoints.length; i++) {
      const ep = manifest.endpoints[i];
      if (!ep.path) errors.push(`endpoints[${i}] missing "path"`);
      if (!ep.method) warnings.push(`endpoints[${i}] missing "method", assuming GET`);
    }
  }
  if (!manifest.contact) {
    warnings.push('Missing "contact" field');
  }
  if (!manifest.license) {
    warnings.push('Missing "license" field');
  }

  // Level 2: signing
  let hasSigningFields = false;
  if (!manifest.publicKey) {
    warnings.push('Missing "publicKey" — OPP Level 2 requires Ed25519 public key');
  } else {
    hasSigningFields = true;
  }
  if (!manifest.signing) {
    warnings.push('Missing "signing" block — OPP Level 2 requires signing configuration');
  } else {
    if (manifest.signing.algorithm !== 'Ed25519') {
      warnings.push(`Signing algorithm "${manifest.signing.algorithm}" is not Ed25519`);
    }
    hasSigningFields = hasSigningFields && manifest.signing.algorithm === 'Ed25519';
  }

  // Level 3: freshness
  let hasFreshness = false;
  if (!manifest.freshness) {
    warnings.push('Missing "freshness" block — OPP Level 3 requires freshness data');
  } else {
    if (!manifest.freshness.guarantee) {
      warnings.push('Missing freshness.guarantee');
    }
    if (!manifest.freshness.lastUpdated) {
      warnings.push('Missing freshness.lastUpdated');
    }
    hasFreshness = !!(manifest.freshness.guarantee && manifest.freshness.lastUpdated);
  }

  // Determine OPP compliance level
  let oppLevel = 0;
  if (errors.length === 0) {
    oppLevel = 1; // basic manifest valid
    if (hasSigningFields) {
      oppLevel = 2; // signing present
      if (hasFreshness) {
        oppLevel = 3; // full compliance
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    oppLevel,
  };
}

// ---------------------------------------------------------------------------
// Admin: remove provider
// ---------------------------------------------------------------------------

async function removeProvider(env, providerId) {
  const redis = getRedis(env);
  if (!redis) throw new Error('Redis not configured');

  const provider = await getProvider(env, providerId);
  if (!provider) throw new Error(`Provider not found: ${providerId}`);

  const pipeline = redis.pipeline();
  pipeline.del(providerKey(providerId));
  pipeline.del(healthKey(providerId));
  pipeline.srem(INDEX_KEY, providerId);

  for (const domain of (provider.domains || [])) {
    pipeline.zrem(domainKey(domain.toLowerCase()), providerId);
  }

  await pipeline.exec();
  return { removed: providerId };
}

module.exports = {
  registerProvider,
  discoverProviders,
  getProvider,
  listProviders,
  scoreProvider,
  checkProviderHealth,
  routeQuery,
  validateManifest,
  removeProvider,
};
