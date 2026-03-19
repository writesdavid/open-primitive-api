const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

let redis = null;

function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

const VALID_DOMAINS = ['flights', 'cars', 'food', 'water', 'drugs', 'hospitals', 'health', 'safety'];
const VALID_EVENTS = ['new_recall', 'new_violation', 'new_alert', 'rating_change'];

/**
 * Register a webhook for a given API key.
 * Stored at webhook:{apiKey}:{id} in Redis.
 */
async function registerWebhook(apiKey, url, domains, events) {
  const r = getRedis();
  if (!r) return { error: 'Redis not configured' };

  // Validate
  if (!url || !url.startsWith('https://')) return { error: 'URL must use HTTPS' };
  if (!Array.isArray(domains) || !domains.every(d => VALID_DOMAINS.includes(d))) {
    return { error: `Invalid domains. Valid: ${VALID_DOMAINS.join(', ')}` };
  }
  if (!Array.isArray(events) || !events.every(e => VALID_EVENTS.includes(e))) {
    return { error: `Invalid events. Valid: ${VALID_EVENTS.join(', ')}` };
  }

  const id = crypto.randomUUID();
  const webhook = {
    id,
    url,
    domains,
    events,
    active: true,
    created: new Date().toISOString(),
  };

  const key = `webhook:${apiKey}:${id}`;
  await r.set(key, JSON.stringify(webhook));

  return webhook;
}

/**
 * List all webhooks for an API key.
 */
async function listWebhooks(apiKey) {
  const r = getRedis();
  if (!r) return [];

  const keys = await r.keys(`webhook:${apiKey}:*`);
  if (!keys.length) return [];

  const values = await Promise.all(keys.map(k => r.get(k)));
  return values.map(v => typeof v === 'string' ? JSON.parse(v) : v);
}

/**
 * Delete a single webhook by API key and webhook ID.
 */
async function deleteWebhook(apiKey, id) {
  const r = getRedis();
  if (!r) return { error: 'Redis not configured' };

  const key = `webhook:${apiKey}:${id}`;
  const deleted = await r.del(key);
  return { deleted: deleted > 0 };
}

/**
 * Find all webhooks matching a domain+event and POST to each URL.
 * Fire-and-forget. 5s timeout per request. Failures are logged, not thrown.
 */
async function notifyWebhooks(domain, event, data) {
  const r = getRedis();
  if (!r) return;

  // Scan all webhook keys across all API keys
  const keys = await r.keys('webhook:*');
  if (!keys.length) return;

  const values = await Promise.all(keys.map(k => r.get(k)));
  const webhooks = values
    .map(v => typeof v === 'string' ? JSON.parse(v) : v)
    .filter(w => w.active && w.domains.includes(domain) && w.events.includes(event));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  const deliveries = webhooks.map(w =>
    fetch(w.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, event, data, timestamp: new Date().toISOString() }),
      signal: controller.signal,
    }).catch(err => {
      console.error(`Webhook delivery failed for ${w.url}: ${err.message}`);
    })
  );

  // Fire-and-forget — don't await in the caller if you don't want to block
  await Promise.allSettled(deliveries);
  clearTimeout(timeout);
}

/*
 * ─── BACKGROUND DATA-CHANGE DETECTION (design notes) ───
 *
 * A scheduled job (Vercel cron or external) hits GET /internal/check-new-data.
 * The flow for each domain:
 *
 * 1. Fetch current data from the upstream source (e.g., FDA Enforcement API).
 * 2. Load the previous snapshot from Redis at key "snapshot:{domain}".
 * 3. Diff the two — compare by unique ID (recall number, violation ID, etc.).
 *    For food: each recall has an `recall_number` field. New = present in current but absent in snapshot.
 * 4. If new items exist:
 *    - Call notifyWebhooks('food', 'new_recall', newRecalls)
 *    - Overwrite "snapshot:food" in Redis with current data
 * 5. If no new items, do nothing.
 *
 * Implementation would look like:
 *
 *   async function checkFood() {
 *     const current = await food.getRecent();
 *     const prev = await redis.get('snapshot:food');
 *     const prevIds = new Set((prev || []).map(r => r.recall_number));
 *     const newRecalls = current.recalls.filter(r => !prevIds.has(r.recall_number));
 *     if (newRecalls.length) {
 *       await notifyWebhooks('food', 'new_recall', newRecalls);
 *       await redis.set('snapshot:food', JSON.stringify(current.recalls));
 *     }
 *   }
 *
 * Same pattern applies to water (new violations), drugs (new adverse events),
 * hospitals (rating changes), etc. Each domain needs its own diff key.
 *
 * Cron schedule: every 6 hours is sufficient for FDA/EPA data freshness.
 * Vercel cron config in vercel.json: { "crons": [{ "path": "/internal/check-new-data", "schedule": "0 *\/6 * * *" }] }
 */

module.exports = { registerWebhook, listWebhooks, deleteWebhook, notifyWebhooks, VALID_DOMAINS, VALID_EVENTS };
