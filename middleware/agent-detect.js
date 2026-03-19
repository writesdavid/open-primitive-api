const AGENT_PATTERNS = [
  { pattern: /claudebot|claude-web|anthropic-ai/i, name: 'claude' },
  { pattern: /chatgpt-user|gptbot|openai/i, name: 'chatgpt' },
  { pattern: /perplexitybot/i, name: 'perplexity' },
  { pattern: /google-extended|googlebot-extended/i, name: 'google' },
  { pattern: /bingbot|bingpreview/i, name: 'bing' },
  { pattern: /meta-externalagent|facebookbot/i, name: 'meta' },
  { pattern: /bytespider/i, name: 'bytespider' },
  { pattern: /ccbot/i, name: 'ccbot' },
  { pattern: /cohere-ai/i, name: 'cohere' },
  { pattern: /bot|crawler/i, name: 'unknown-bot' },
];

const stats = {
  total: 0,
  agent: 0,
  human: 0,
  byAgent: {},
  byEndpoint: {},
  hourly: [],
  upSince: new Date().toISOString(),
};

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

  next();
}

function getStats() {
  return { ...stats, hourly: stats.hourly.slice() };
}

module.exports = { agentDetect, getStats };
