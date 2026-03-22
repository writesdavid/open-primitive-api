// Auth middleware — no API key required, no rate limits
// Kept for compatibility with middleware chain

async function apiKeyAuth(req, res, next) {
  req.apiKey = 'open';
  req.keyOwner = 'anonymous';
  next();
}

async function rateLimitMiddleware(req, res, next) {
  next();
}

async function meterUsage(req, res, next) {
  next();
}

module.exports = { apiKeyAuth, rateLimitMiddleware, meterUsage };
