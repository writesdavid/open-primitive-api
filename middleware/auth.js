const { Redis } = require('@upstash/redis');
const { Ratelimit } = require('@upstash/ratelimit');

let redis = null;
let ratelimit = null;

function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(200, '1 h'),
      prefix: 'ratelimit',
    });
  }
  return { redis, ratelimit };
}

async function apiKeyAuth(req, res, next) {
  const { redis } = getRedis();

  // If no Redis configured, allow unauthenticated access (dev mode)
  if (!redis) {
    req.apiKey = 'dev';
    req.keyOwner = 'anonymous';
    req.keyTier = 'free';
    return next();
  }

  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key) {
    return res.status(401).json({
      error: 'Missing API key',
      hint: 'Pass your key via X-API-Key header or ?api_key= query parameter',
    });
  }

  try {
    const keyData = await redis.hgetall(`apikey:${key}`);
    if (!keyData || !keyData.active || keyData.active !== 'true') {
      return res.status(403).json({ error: 'Invalid or inactive API key' });
    }

    req.apiKey = key;
    req.keyOwner = keyData.owner || 'unknown';
    req.keyTier = keyData.tier || 'free';
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    // Fail open in case of Redis outage — don't block requests
    req.apiKey = key;
    req.keyOwner = 'unknown';
    req.keyTier = 'free';
    next();
  }
}

async function rateLimitMiddleware(req, res, next) {
  const { ratelimit } = getRedis();
  if (!ratelimit) return next();

  try {
    const { success, limit, remaining, reset } = await ratelimit.limit(req.apiKey);
    res.set('X-RateLimit-Limit', String(limit));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset', String(reset));
    if (!success) {
      return res.status(429).json({ error: 'Rate limit exceeded. 200 requests per hour.' });
    }
    next();
  } catch (err) {
    console.error('Rate limit error:', err.message);
    next();
  }
}

async function meterUsage(req, res, next) {
  const { redis } = getRedis();
  if (!redis) return next();

  const day = new Date().toISOString().slice(0, 10);
  const endpoint = req.route ? req.route.path : req.path;

  // Fire and forget — don't block the request
  Promise.all([
    redis.incr(`usage:${req.apiKey}:${day}`),
    redis.incr(`usage:${req.apiKey}:${day}:${endpoint}`),
    redis.incr(`usage:global:${day}`),
  ]).catch(() => {});

  next();
}

module.exports = { apiKeyAuth, rateLimitMiddleware, meterUsage };
