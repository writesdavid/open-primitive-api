const crypto = require('crypto');

// Domain fallback map: if X is down, suggest Y
const FALLBACKS = {
  drugs: {
    alternative: '/v1/health',
    reason: 'PubMed health data covers drug safety topics',
  },
  water: {
    alternative: '/v1/demographics',
    reason: 'Demographics endpoint still returns ZIP-level info',
  },
  food: {
    alternative: '/v1/products',
    reason: 'CPSC product recall data covers similar safety ground',
  },
  hospitals: {
    alternative: '/v1/health',
    reason: 'PubMed health data covers hospital and care quality research',
  },
  flights: {
    alternative: '/v1/weather',
    reason: 'Airport weather conditions available while flight data recovers',
  },
};

// Upstream status URLs per domain (known federal APIs)
const UPSTREAM_HINTS = {
  drugs: 'https://api.fda.gov',
  food: 'https://api.fda.gov',
  water: 'https://data.epa.gov',
  hospitals: 'https://data.cms.gov',
  flights: 'https://www.fly.faa.gov',
  health: 'https://pubmed.ncbi.nlm.nih.gov',
};

function domainFromPath(path) {
  var parts = path.replace(/^\/v1\//, '').split('/');
  return parts[0] || 'unknown';
}

// Decide what an agent should do based on status code and context
function pickAction(statusCode, hasCached) {
  if (statusCode === 429) return 'retry';
  if (statusCode === 503 || statusCode === 502 || statusCode === 504) {
    return hasCached ? 'use_cached' : 'retry';
  }
  if (statusCode >= 500) {
    return hasCached ? 'use_cached' : 'try_alternative';
  }
  if (statusCode === 404) return 'try_alternative';
  if (statusCode === 400) return 'inform_user';
  return 'inform_user';
}

function retrySeconds(statusCode) {
  if (statusCode === 429) return 30;
  if (statusCode >= 500) return 60;
  return null;
}

function buildUserMessage(domain, statusCode, hasCached) {
  var source = UPSTREAM_HINTS[domain] || 'the upstream federal API';
  var base = domain.charAt(0).toUpperCase() + domain.slice(1) + ' data from ' + source;

  if (statusCode === 429) {
    return base + ' is rate-limited. Retry in 30 seconds.';
  }
  if (statusCode >= 500 && hasCached) {
    return base + ' is temporarily unavailable. Cached data is available from the archive.';
  }
  if (statusCode >= 500) {
    return base + ' is temporarily unavailable. No cached data on hand.';
  }
  if (statusCode === 404) {
    return base + ' returned no results for this query.';
  }
  return base + ' returned an error (' + statusCode + ').';
}

// Check archive (Upstash) for cached data on this domain
// Returns { available: boolean, age_description: string | null }
function checkArchiveCache(domain) {
  try {
    var url = process.env.UPSTASH_REDIS_REST_URL;
    var token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return Promise.resolve({ available: false, age_description: null });

    var Redis = require('@upstash/redis').Redis;
    var r = new Redis({ url: url, token: token });
    var today = new Date().toISOString().slice(0, 10);
    var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Scan for recent archive keys — try today, then yesterday
    return r.keys('archive:' + domain + ':' + today + ':*')
      .then(function (keys) {
        if (keys && keys.length > 0) {
          return { available: true, age_description: 'from today' };
        }
        return r.keys('archive:' + domain + ':' + yesterday + ':*')
          .then(function (olderKeys) {
            if (olderKeys && olderKeys.length > 0) {
              return { available: true, age_description: 'from yesterday' };
            }
            return { available: false, age_description: null };
          });
      })
      .catch(function () {
        return { available: false, age_description: null };
      });
  } catch (e) {
    return Promise.resolve({ available: false, age_description: null });
  }
}

/**
 * Middleware that intercepts error responses on /v1/* routes
 * and wraps them with agent-friendly guidance.
 */
function agentErrors(req, res, next) {
  if (!req.path.startsWith('/v1/')) {
    return next();
  }

  var originalJson = res.json.bind(res);

  res.json = function (body) {
    var code = res.statusCode;

    // Only intercept 4xx and 5xx
    if (code < 400) {
      return originalJson(body);
    }

    var domain = domainFromPath(req.path);
    var errorMessage = (body && body.error) || (body && body.message) || 'Unknown error';

    // Check cache, then send enriched response
    checkArchiveCache(domain).then(function (cache) {
      var action = pickAction(code, cache.available);
      var fallback = FALLBACKS[domain];
      var retry = retrySeconds(code);

      var guidance = {
        action: action,
        user_message: buildUserMessage(domain, code, cache.available),
        cached_available: cache.available,
        upstream_status: 'https://api.openprimitive.com/v1/status',
      };

      if (retry !== null) {
        guidance.retry_after_seconds = retry;
      }

      if (cache.available && cache.age_description) {
        guidance.user_message += ' Most recent cached data is ' + cache.age_description + '.';
        guidance.cache_hint = 'Replay this query with ?source=cache to get archived data.';
      }

      if (fallback && (action === 'try_alternative' || (action !== 'retry' && !cache.available))) {
        guidance.alternative_endpoint = fallback.alternative;
        guidance.alternative_reason = fallback.reason;
      }

      var enriched = {
        error: errorMessage,
        agent_guidance: guidance,
      };

      // Preserve any extra fields from the original body
      if (body && typeof body === 'object') {
        var keys = Object.keys(body);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (k !== 'error' && k !== 'message') {
            enriched[k] = body[k];
          }
        }
      }

      originalJson(enriched);
    });
  };

  next();
}

module.exports = { agentErrors };
