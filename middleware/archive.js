const crypto = require('crypto');

// Lazy-init Upstash Redis client
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
    console.error('Archive: failed to init Upstash Redis', e.message);
    return null;
  }
}

function shortHash(str) {
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 8);
}

function domainFromPath(path) {
  // /v1/flights/DL -> flights, /v1/cars -> cars
  const parts = path.replace(/^\/v1\//, '').split('/');
  return parts[0] || 'unknown';
}

/**
 * Express middleware that archives /v1/* responses to Upstash Redis.
 * Fire-and-forget — never blocks the response.
 */
function archiveMiddleware(req, res, next) {
  // Only archive /v1/* routes (skip /v1/stats, /v1 root meta)
  if (!req.path.startsWith('/v1/') || req.path === '/v1/stats') {
    return next();
  }

  const originalJson = res.json.bind(res);
  res.json = function (body) {
    // Restore and send
    originalJson(body);

    // Fire-and-forget archive
    const r = getRedis();
    if (!r) return;

    try {
      const domain = domainFromPath(req.path);
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

      // SET with 365-day TTL, don't await
      r.set(key, JSON.stringify(record), { ex: 365 * 24 * 60 * 60 }).catch(() => {});
    } catch (e) {
      // Never break the response
    }
  };

  next();
}

/**
 * GET /v1/history?domain=&date=
 * Placeholder route — retrieval layer comes later.
 */
function historyRoute(req, res) {
  // TODO: Implement retrieval. Will scan archive:{domain}:{date}:* keys
  // and return all archived responses for that domain + date.
  // For now, confirm the endpoint exists.
  const { domain, date } = req.query;
  if (!domain || !date) {
    return res.status(400).json({ error: 'Provide ?domain= and ?date= (YYYY-MM-DD)' });
  }
  res.json({
    status: 'not_implemented',
    message: 'History retrieval coming soon. Data is being archived.',
    domain,
    date,
  });
}

module.exports = { archiveMiddleware, historyRoute };
