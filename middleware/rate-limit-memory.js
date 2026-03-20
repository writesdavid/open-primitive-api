// In-memory rate limiter for Vercel serverless
// Limits reset on cold starts — fine for free tier (generous daily cap)
// Paid tiers use Redis with a 2s timeout fallback

const store = new Map();

const TIERS = {
  free: { limit: 500, window: 86400000 },       // 500/day
  starter: { limit: 5000, window: 86400000 },    // 5,000/day
  pro: { limit: 50000, window: 86400000 },        // 50,000/day
  unlimited: { limit: Infinity, window: 86400000 },
};

function getWindowKey(windowMs) {
  return Math.floor(Date.now() / windowMs);
}

function memoryCheck(key, tier) {
  const config = TIERS[tier] || TIERS.free;
  if (config.limit === Infinity) return { allowed: true, remaining: Infinity, reset: 0 };

  const windowKey = getWindowKey(config.window);
  const storeKey = `${key}:${windowKey}`;

  const entry = store.get(storeKey) || { count: 0, reset: Date.now() + config.window };
  entry.count += 1;
  store.set(storeKey, entry);

  // Lazy cleanup: drop old window keys for this prefix
  for (const [k] of store) {
    if (k.startsWith(key + ':') && k !== storeKey) {
      store.delete(k);
    }
  }

  return {
    allowed: entry.count <= config.limit,
    remaining: Math.max(0, config.limit - entry.count),
    reset: entry.reset,
    limit: config.limit,
  };
}

let redisClient = null;
let redisReady = false;

function getRedis() {
  if (redisClient !== null) return redisReady ? redisClient : null;
  const url = process.env.REDIS_URL || process.env.KV_URL;
  if (!url) { redisClient = false; return null; }

  try {
    const { createClient } = require('redis');
    redisClient = createClient({ url });
    redisClient.on('error', () => { redisReady = false; });
    redisClient.on('ready', () => { redisReady = true; });
    redisClient.connect().then(() => { redisReady = true; }).catch(() => { redisReady = false; });
  } catch (e) {
    redisClient = false;
    return null;
  }
  return null; // not ready yet on first call
}

async function redisCheck(key, tier) {
  const redis = getRedis();
  if (!redis || !redisReady) return null;

  const config = TIERS[tier] || TIERS.free;
  const windowKey = getWindowKey(config.window);
  const redisKey = `rl:${key}:${windowKey}`;

  const raceTimeout = new Promise((resolve) => setTimeout(() => resolve(null), 2000));
  const redisOp = (async () => {
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.pExpire(redisKey, config.window);
    return {
      allowed: count <= config.limit,
      remaining: Math.max(0, config.limit - count),
      reset: Date.now() + config.window,
      limit: config.limit,
    };
  })();

  return Promise.race([redisOp, raceTimeout]);
}

function setRateLimitHeaders(res, result) {
  if (!result || result.limit === Infinity) return;
  res.set('X-RateLimit-Limit', String(result.limit));
  res.set('X-RateLimit-Remaining', String(result.remaining));
  res.set('X-RateLimit-Reset', String(Math.ceil(result.reset / 1000)));
}

async function rateLimitMiddleware(req, res, next) {
  // Extract API key
  const apiKey = req.headers['x-api-key'] || req.query.api_key || null;
  const tier = apiKey ? (req.keyTier || 'free') : 'free';
  const key = apiKey || req.ip || 'unknown';

  req.apiKey = apiKey || 'anonymous';
  req.keyOwner = 'anonymous';
  req.keyTier = tier;

  // Paid tiers: try Redis first, fall back to memory
  if (apiKey && tier !== 'free') {
    const redisResult = await redisCheck(key, tier);
    if (redisResult) {
      setRateLimitHeaders(res, redisResult);
      if (!redisResult.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          limit: redisResult.limit,
          reset: new Date(redisResult.reset).toISOString(),
        });
      }
      return next();
    }
    // Redis unavailable — fall through to memory (allow the request)
  }

  // Free tier / fallback: in-memory
  const result = memoryCheck(key, tier);
  setRateLimitHeaders(res, result);

  if (!result.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      limit: result.limit,
      reset: new Date(result.reset).toISOString(),
    });
  }

  next();
}

module.exports = { rateLimitMiddleware, TIERS };
