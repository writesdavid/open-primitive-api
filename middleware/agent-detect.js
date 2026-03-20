const AGENT_PATTERNS = [
  { pattern: /claudebot|claude-user|claude-searchbot|claude-web|anthropic-ai/i, name: 'claude' },
  { pattern: /chatgpt-user|gptbot|oai-searchbot|openai/i, name: 'chatgpt' },
  { pattern: /perplexitybot|perplexity-user/i, name: 'perplexity' },
  { pattern: /google-extended|googlebot-extended/i, name: 'google' },
  { pattern: /bingbot|bingpreview/i, name: 'bing' },
  { pattern: /meta-externalagent|facebookbot/i, name: 'meta' },
  { pattern: /applebot-extended/i, name: 'apple' },
  { pattern: /amazonbot/i, name: 'amazon' },
  { pattern: /bytespider/i, name: 'bytedance' },
  { pattern: /ccbot/i, name: 'ccbot' },
  { pattern: /cohere-ai/i, name: 'cohere' },
  { pattern: /diffbot/i, name: 'diffbot' },
  { pattern: /bot|crawler|spider/i, name: 'unknown-bot' },
];

const stats = {
  total: 0,
  agent: 0,
  human: 0,
  byAgent: {},
  byEndpoint: {},
  topQueries: {},
  hourly: [],
  upSince: new Date().toISOString(),
};

const QUERY_EXTRACTORS = {
  drugs:      (q) => q.name,
  water:      (q) => q.zip,
  cars:       (q) => [q.make, q.model].filter(Boolean).join(' ') || null,
  ask:        (q) => q.q ? q.q.substring(0, 50) : null,
  food:       (q) => q.q,
  hospitals:  (q) => q.q || q.id,
  nutrition:  (q) => q.q || q.id,
  health:     (q) => q.q,
};

function trackQuery(domain, queryValue) {
  if (!queryValue) return;
  const val = String(queryValue).toLowerCase().trim();
  if (!val) return;
  if (!stats.topQueries[domain]) stats.topQueries[domain] = {};
  stats.topQueries[domain][val] = (stats.topQueries[domain][val] || 0) + 1;

  // Prune to top 50
  const entries = Object.entries(stats.topQueries[domain]);
  if (entries.length > 50) {
    entries.sort((a, b) => b[1] - a[1]);
    stats.topQueries[domain] = Object.fromEntries(entries.slice(0, 50));
  }
}

// Initialize 24 hourly buckets
for (let i = 0; i < 24; i++) {
  stats.hourly.push({ hour: i, agent: 0, human: 0 });
}

function detectAgent(ua) {
  if (!ua) return null;
  for (const { pattern, name } of AGENT_PATTERNS) {
    if (pattern.test(ua)) return name;
  }
  return null;
}

function agentDetect(req, res, next) {
  const ua = req.headers['user-agent'] || '';
  const hasApiKey = !!req.headers['x-api-key'];

  let agentName = detectAgent(ua);

  if (!agentName && hasApiKey) {
    agentName = 'api-client';
  }

  req.isAgent = !!agentName;
  req.agentName = agentName || 'human';

  // Track stats
  stats.total++;
  const hour = new Date().getUTCHours();

  if (req.isAgent) {
    stats.agent++;
    stats.byAgent[req.agentName] = (stats.byAgent[req.agentName] || 0) + 1;
    stats.hourly[hour].agent++;
  } else {
    stats.human++;
    stats.hourly[hour].human++;
  }

  const endpoint = req.path || req.url;
  if (!stats.byEndpoint[endpoint]) {
    stats.byEndpoint[endpoint] = { agent: 0, human: 0 };
  }
  stats.byEndpoint[endpoint][req.isAgent ? 'agent' : 'human']++;

  // Track query parameters
  const match = endpoint.match(/^\/v1\/(\w+)/);
  if (match) {
    const domain = match[1];
    const extractor = QUERY_EXTRACTORS[domain];
    if (extractor) {
      const val = extractor(req.query || {});
      trackQuery(domain, val);
    }
  }

  next();
}

function getStats() {
  return { ...stats, topQueries: { ...stats.topQueries }, hourly: stats.hourly.slice() };
}

module.exports = { agentDetect, getStats };
