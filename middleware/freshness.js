/**
 * Data freshness monitoring for Open Primitive.
 * Tracks how old each domain's data actually is vs how fresh it should be.
 * Agents read the X-Data-Freshness header to know if they're getting live data or stale cache.
 */

// Expected max age per domain in seconds
const FRESHNESS_THRESHOLDS = {
  flights:      15 * 60,        // 15 minutes — real-time
  cars:         24 * 60 * 60,   // 24 hours — continuous
  food:         6 * 60 * 60,    // 6 hours — continuous
  water:        24 * 60 * 60,   // 24 hours — quarterly source, daily cache
  drugs:        6 * 60 * 60,    // 6 hours — quarterly source
  hospitals:    24 * 60 * 60,   // 24 hours — monthly source
  health:       1 * 60 * 60,    // 1 hour — daily source
  nutrition:    24 * 60 * 60,   // 24 hours — periodic
  jobs:         24 * 60 * 60,   // 24 hours — monthly source
  demographics: 7 * 24 * 60 * 60, // 7 days — annual source
  products:     6 * 60 * 60,    // 6 hours — continuous
  sec:          1 * 60 * 60,    // 1 hour — real-time source
  weather:      30 * 60,        // 30 minutes — real-time
};

// In-memory store: domain -> timestamp (epoch ms) of last successful fetch
const lastFetched = {};

/**
 * Record that a domain just fetched fresh data.
 * Call this from source modules after a successful upstream fetch.
 */
function recordFetch(domain) {
  lastFetched[domain] = Date.now();
}

/**
 * Get the age in seconds for a domain. Returns null if never fetched.
 */
function getAge(domain) {
  if (!lastFetched[domain]) return null;
  return Math.round((Date.now() - lastFetched[domain]) / 1000);
}

/**
 * Determine freshness status for a single domain.
 */
function getDomainFreshness(domain) {
  const expectedMaxAge = FRESHNESS_THRESHOLDS[domain];
  if (!expectedMaxAge) return null;

  const age = getAge(domain);
  let status = 'unknown';
  if (age !== null) {
    status = age <= expectedMaxAge ? 'fresh' : 'stale';
  }

  return {
    domain,
    expectedMaxAge,
    lastFetched: lastFetched[domain] ? new Date(lastFetched[domain]).toISOString() : null,
    actualAge: age,
    status,
  };
}

/**
 * Full freshness report across all tracked domains.
 */
function getFreshnessReport() {
  const domains = Object.keys(FRESHNESS_THRESHOLDS).map(getDomainFreshness);
  const fresh = domains.filter(d => d.status === 'fresh').length;
  const stale = domains.filter(d => d.status === 'stale').length;
  const unknown = domains.filter(d => d.status === 'unknown').length;

  return {
    generatedAt: new Date().toISOString(),
    summary: { total: domains.length, fresh, stale, unknown },
    domains,
  };
}

/**
 * Extract domain name from request path.
 * /v1/flights -> flights, /v1/cars -> cars, etc.
 */
function domainFromPath(path) {
  if (!path) return null;
  const match = path.match(/^\/v1\/([a-z]+)/);
  return match ? match[1] : null;
}

/**
 * Express middleware. Adds X-Data-Freshness header with age in seconds.
 * Also records fetches when a domain response completes successfully.
 */
function freshnessMiddleware(req, res, next) {
  const domain = domainFromPath(req.path);
  if (!domain || !FRESHNESS_THRESHOLDS[domain]) return next();

  // Intercept successful responses to record the fetch
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    // Only record if the response looks successful (no error field, status 2xx)
    if (res.statusCode < 400 && !(body && body.error)) {
      recordFetch(domain);
    }

    // Add freshness header
    const age = getAge(domain);
    if (age !== null) {
      res.set('X-Data-Freshness', String(age));
    } else {
      res.set('X-Data-Freshness', 'unknown');
    }

    const threshold = FRESHNESS_THRESHOLDS[domain];
    res.set('X-Data-Max-Age', String(threshold));

    return originalJson(body);
  };

  next();
}

module.exports = {
  recordFetch,
  getAge,
  getDomainFreshness,
  getFreshnessReport,
  freshnessMiddleware,
  FRESHNESS_THRESHOLDS,
};
