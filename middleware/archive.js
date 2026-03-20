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
 * GET /v1/history?domain=&date=&zip=&name=
 * Retrieves archived API responses from Redis.
 * domain and date (YYYY-MM-DD) required. zip and name filter results.
 * Returns up to 50 records with a 5-second timeout on the scan.
 */
function historyRoute(req, res) {
  const { domain, date, zip, name } = req.query;
  if (!domain || !date) {
    return res.status(400).json({ error: 'Provide ?domain= and ?date= (YYYY-MM-DD)' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }

  const r = getRedis();
  if (!r) {
    return res.status(503).json({ error: 'Archive storage unavailable. Redis not configured.' });
  }

  const MAX_RESULTS = 50;
  const TIMEOUT_MS = 5000;
  const pattern = `archive:${domain}:${date}:*`;

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Redis scan timed out')), TIMEOUT_MS)
  );

  const scan = (async () => {
    const keys = [];
    let cursor = 0;
    do {
      const result = await r.scan(cursor, { match: pattern, count: 100 });
      cursor = result[0];
      keys.push(...result[1]);
      if (keys.length >= MAX_RESULTS) break;
    } while (cursor !== 0 && cursor !== '0');
    return keys.slice(0, MAX_RESULTS);
  })();

  Promise.race([scan, timeout])
    .then(async (keys) => {
      if (!keys.length) {
        return res.json({ domain, date, records: [], count: 0 });
      }

      const raw = await Promise.all(keys.map((k) => r.get(k)));
      let records = raw
        .map((val) => {
          if (!val) return null;
          try {
            const rec = typeof val === 'string' ? JSON.parse(val) : val;
            return { query: rec.query, data: rec.data, timestamp: rec.timestamp };
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);

      // Filter by zip or name if provided
      if (zip) {
        records = records.filter((rec) => {
          const q = (rec.query || '').toLowerCase();
          const d = JSON.stringify(rec.data || '').toLowerCase();
          return q.includes(zip.toLowerCase()) || d.includes(zip.toLowerCase());
        });
      }
      if (name) {
        records = records.filter((rec) => {
          const q = (rec.query || '').toLowerCase();
          const d = JSON.stringify(rec.data || '').toLowerCase();
          return q.includes(name.toLowerCase()) || d.includes(name.toLowerCase());
        });
      }

      res.json({ domain, date, records, count: records.length });
    })
    .catch((err) => {
      res.status(504).json({ error: err.message || 'Archive retrieval failed' });
    });
}

module.exports = { archiveMiddleware, historyRoute };
