/**
 * subscriptions.js — Real-time event subscription module for Open Primitive API
 *
 * Enables agents to subscribe to data changes and receive push notifications
 * when relevant data updates. Stored in Upstash Redis via REST API.
 * Designed for Cloudflare Workers + Hono + nodejs_compat.
 */

const { Redis } = require('@upstash/redis');

// ---------------------------------------------------------------------------
// Redis client
// ---------------------------------------------------------------------------

let _redis = null;
function getRedis(env) {
  if (_redis) return _redis;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
  _redis = new Redis({ url, token });
  return _redis;
}

// ---------------------------------------------------------------------------
// Domain filter definitions
// ---------------------------------------------------------------------------

const DOMAIN_FILTERS = {
  drugs: ['drugName', 'manufacturer', 'reactionType', 'severity'],
  food: ['product', 'reason', 'classification', 'company'],
  water: ['zip', 'pwsid', 'contaminant', 'violationType'],
  cars: ['make', 'model', 'year', 'component'],
  products: ['productType', 'hazard'],
  weather: ['zip', 'alertType', 'severity'],
  air: ['zip', 'pollutant', 'aqiThreshold'],
  sec: ['ticker', 'cik', 'filingType'],
  earthquakes: ['minMagnitude', 'region'],
  reclaim: ['state', 'propertyType', 'minAmount'],
  clinical_trials: ['condition', 'intervention', 'phase', 'status'],
};

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateId() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// Subscription management
// ---------------------------------------------------------------------------

/**
 * Create a subscription.
 * Returns the created subscription object with its ID.
 */
async function createSubscription(env, opts) {
  const { agentId, domain, filter, webhookUrl, format = 'opp', signingRequired = true } = opts;

  if (!agentId) throw new Error('agentId is required');
  if (!domain) throw new Error('domain is required');
  if (!webhookUrl) throw new Error('webhookUrl is required');
  if (!DOMAIN_FILTERS[domain]) throw new Error(`Unsupported domain: ${domain}. Supported: ${Object.keys(DOMAIN_FILTERS).join(', ')}`);

  // Validate filter fields against domain schema
  if (filter && typeof filter === 'object') {
    const allowed = DOMAIN_FILTERS[domain];
    for (const key of Object.keys(filter)) {
      if (!allowed.includes(key)) {
        throw new Error(`Invalid filter field '${key}' for domain '${domain}'. Allowed: ${allowed.join(', ')}`);
      }
    }
  }

  const redis = getRedis(env);
  const subscriptionId = generateId();
  const now = Date.now();

  const subscription = {
    id: subscriptionId,
    agentId,
    domain,
    filter: filter || {},
    webhookUrl,
    format,
    signingRequired,
    createdAt: now,
    updatedAt: now,
    active: true,
  };

  // Store subscription data + add to agent and domain indices
  await Promise.all([
    redis.set(`sub:${subscriptionId}`, JSON.stringify(subscription)),
    redis.sadd(`subs:agent:${agentId}`, subscriptionId),
    redis.sadd(`subs:domain:${domain}`, subscriptionId),
  ]);

  return subscription;
}

/**
 * List all subscriptions for an agent.
 */
async function listSubscriptions(env, agentId) {
  if (!agentId) throw new Error('agentId is required');
  const redis = getRedis(env);

  const ids = await redis.smembers(`subs:agent:${agentId}`);
  if (!ids || ids.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const id of ids) pipeline.get(`sub:${id}`);
  const results = await pipeline.exec();

  return results
    .map((r) => {
      if (!r) return null;
      try { return typeof r === 'string' ? JSON.parse(r) : r; } catch { return null; }
    })
    .filter(Boolean);
}

/**
 * Delete a subscription by ID.
 * Returns true if deleted, false if not found.
 */
async function deleteSubscription(env, subscriptionId) {
  if (!subscriptionId) throw new Error('subscriptionId is required');
  const redis = getRedis(env);

  const raw = await redis.get(`sub:${subscriptionId}`);
  if (!raw) return false;

  const sub = typeof raw === 'string' ? JSON.parse(raw) : raw;

  await Promise.all([
    redis.del(`sub:${subscriptionId}`),
    redis.srem(`subs:agent:${sub.agentId}`, subscriptionId),
    redis.srem(`subs:domain:${sub.domain}`, subscriptionId),
  ]);

  return true;
}

// ---------------------------------------------------------------------------
// Filter matching
// ---------------------------------------------------------------------------

/**
 * Evaluate whether an event matches a subscription's filter.
 *
 * Supports:
 * - Exact match: { drugName: 'aspirin' }
 * - Prefix match: { drugName: 'asp*' }
 * - Numeric comparison: { minMagnitude: { gt: 4.0 } } or { year: { gte: 2020, lte: 2024 } }
 *
 * All filter predicates are ANDed together. Returns true if filter is empty.
 */
function matchesFilter(event, filter) {
  if (!filter || typeof filter !== 'object') return true;

  const keys = Object.keys(filter);
  if (keys.length === 0) return true;

  for (const key of keys) {
    const predicate = filter[key];
    const value = event[key];

    // Numeric comparison object: { gt, lt, gte, lte }
    if (predicate !== null && typeof predicate === 'object' && !Array.isArray(predicate)) {
      const num = Number(value);
      if (isNaN(num)) return false;
      if ('gt' in predicate && !(num > Number(predicate.gt))) return false;
      if ('lt' in predicate && !(num < Number(predicate.lt))) return false;
      if ('gte' in predicate && !(num >= Number(predicate.gte))) return false;
      if ('lte' in predicate && !(num <= Number(predicate.lte))) return false;
      continue;
    }

    // String predicate
    const pred = String(predicate);

    // Prefix match
    if (pred.endsWith('*')) {
      const prefix = pred.slice(0, -1).toLowerCase();
      if (value === undefined || value === null) return false;
      if (!String(value).toLowerCase().startsWith(prefix)) return false;
      continue;
    }

    // Exact match (case-insensitive for strings)
    if (value === undefined || value === null) return false;
    if (String(value).toLowerCase() !== pred.toLowerCase()) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Event publishing
// ---------------------------------------------------------------------------

/**
 * Publish an event to all matching subscriptions for a domain.
 *
 * signFn: async (payload) => signature string (Ed25519)
 *
 * Returns { matched, delivered, failed } counts.
 */
async function publishEvent(env, domain, event, signFn) {
  const redis = getRedis(env);
  const eventId = event.id || generateId();
  event.id = eventId;
  event._domain = domain;
  event._publishedAt = Date.now();

  // Find all subscriptions for this domain
  const subIds = await redis.smembers(`subs:domain:${domain}`);
  if (!subIds || subIds.length === 0) return { matched: 0, delivered: 0, failed: 0 };

  // Load subscription objects
  const pipeline = redis.pipeline();
  for (const id of subIds) pipeline.get(`sub:${id}`);
  const rawSubs = await pipeline.exec();

  const subs = rawSubs
    .map((r) => {
      if (!r) return null;
      try { return typeof r === 'string' ? JSON.parse(r) : r; } catch { return null; }
    })
    .filter(Boolean)
    .filter((s) => s.active !== false);

  // Filter matching subscriptions
  const matched = subs.filter((s) => matchesFilter(event, s.filter));

  if (matched.length === 0) return { matched: 0, delivered: 0, failed: 0 };

  // Store event in Redis for SSE polling (TTL 1 hour)
  await redis.set(`event:${domain}:${eventId}`, JSON.stringify(event), { ex: 3600 });
  // Add to domain event stream (sorted set scored by timestamp)
  await redis.zadd(`events:${domain}`, { score: event._publishedAt, member: eventId });
  // Trim to last 1000 events
  await redis.zremrangebyrank(`events:${domain}`, 0, -1001);

  // Deliver webhooks
  const results = await Promise.allSettled(
    matched.map((sub) => processWebhookDelivery(env, sub, event, signFn))
  );

  let delivered = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value === true) delivered++;
    else failed++;
  }

  return { matched: matched.length, delivered, failed };
}

// ---------------------------------------------------------------------------
// Webhook delivery
// ---------------------------------------------------------------------------

/**
 * Deliver a single webhook notification with retry logic.
 * 3 attempts with exponential backoff: 1s, 5s, 25s.
 * Returns true on success, false on failure.
 */
async function processWebhookDelivery(env, subscription, event, signFn) {
  const redis = getRedis(env);
  const eventId = event.id;
  const deliveryKey = `delivery:${subscription.id}:${eventId}`;

  // Build payload
  const payload = buildPayload(subscription, event);
  const body = JSON.stringify(payload);

  const headers = { 'Content-Type': 'application/json' };

  // Sign if required
  if (subscription.signingRequired && signFn) {
    const signature = await signFn(body);
    headers['X-OPP-Signature'] = signature;
  }

  const delays = [1000, 5000, 25000];
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(subscription.webhookUrl, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        await redis.set(deliveryKey, JSON.stringify({
          status: 'success',
          attempt: attempt + 1,
          statusCode: res.status,
          deliveredAt: Date.now(),
        }), { ex: 86400 }); // TTL 24h
        return true;
      }

      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err.message || 'fetch failed';
    }

    // Wait before retry (skip wait on last attempt)
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }

  // Record failure
  await redis.set(deliveryKey, JSON.stringify({
    status: 'failed',
    attempts: 3,
    lastError,
    failedAt: Date.now(),
  }), { ex: 86400 });

  return false;
}

/**
 * Build the notification payload in the requested format.
 */
function buildPayload(subscription, event) {
  if (subscription.format === 'raw') {
    return {
      subscriptionId: subscription.id,
      domain: event._domain,
      event,
      timestamp: event._publishedAt,
    };
  }

  // OPP envelope format
  return {
    envelope: 'opp/1.0',
    subscriptionId: subscription.id,
    domain: event._domain,
    timestamp: new Date(event._publishedAt).toISOString(),
    data: event,
    meta: {
      agentId: subscription.agentId,
      format: 'opp',
      source: 'open-primitive-api',
    },
  };
}

// ---------------------------------------------------------------------------
// SSE streaming
// ---------------------------------------------------------------------------

/**
 * Create a ReadableStream for Server-Sent Events.
 *
 * Polls Redis for new events matching the agent's subscriptions.
 * Returns a ReadableStream suitable for a Response with Content-Type: text/event-stream.
 */
function createSSEStream(env, agentId, domains) {
  const redis = getRedis(env);
  const encoder = new TextEncoder();
  let cancelled = false;
  let lastTimestamp = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ agentId, domains, connectedAt: new Date().toISOString() })}\n\n`));
    },

    async pull(controller) {
      if (cancelled) {
        controller.close();
        return;
      }

      try {
        // Load agent's subscriptions to get active filters
        const subs = await listSubscriptions(env, agentId);
        const activeSubs = subs.filter(
          (s) => s.active !== false && (!domains || domains.length === 0 || domains.includes(s.domain))
        );

        if (activeSubs.length === 0) {
          // Send heartbeat and wait
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          await new Promise((r) => setTimeout(r, 5000));
          return;
        }

        // Collect unique domains from active subscriptions
        const activeDomains = [...new Set(activeSubs.map((s) => s.domain))];

        let foundEvents = false;

        for (const domain of activeDomains) {
          // Get event IDs newer than lastTimestamp
          const eventIds = await redis.zrangebyscore(
            `events:${domain}`,
            lastTimestamp + 1,
            '+inf',
            { limit: { offset: 0, count: 50 } }
          );

          if (!eventIds || eventIds.length === 0) continue;

          // Load events
          const evtPipeline = redis.pipeline();
          for (const eid of eventIds) evtPipeline.get(`event:${domain}:${eid}`);
          const rawEvents = await evtPipeline.exec();

          const domainSubs = activeSubs.filter((s) => s.domain === domain);

          for (const raw of rawEvents) {
            if (!raw) continue;
            const evt = typeof raw === 'string' ? JSON.parse(raw) : raw;

            // Check if any subscription matches this event
            for (const sub of domainSubs) {
              if (matchesFilter(evt, sub.filter)) {
                const payload = buildPayload(sub, evt);
                controller.enqueue(
                  encoder.encode(`event: ${domain}\nid: ${evt.id}\ndata: ${JSON.stringify(payload)}\n\n`)
                );
                foundEvents = true;
                break; // one SSE per event, not per subscription
              }
            }

            // Update cursor
            if (evt._publishedAt && evt._publishedAt > lastTimestamp) {
              lastTimestamp = evt._publishedAt;
            }
          }
        }

        if (!foundEvents) {
          // Heartbeat
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        }

        // Poll interval
        await new Promise((r) => setTimeout(r, 2000));
      } catch (err) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`));
        await new Promise((r) => setTimeout(r, 5000));
      }
    },

    cancel() {
      cancelled = true;
    },
  });

  return stream;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * Get subscription statistics.
 */
async function getSubscriptionStats(env) {
  const redis = getRedis(env);

  const domains = Object.keys(DOMAIN_FILTERS);

  // Count subscriptions per domain
  const pipeline = redis.pipeline();
  for (const d of domains) pipeline.scard(`subs:domain:${d}`);
  const domainCounts = await pipeline.exec();

  const byDomain = {};
  let total = 0;
  for (let i = 0; i < domains.length; i++) {
    const count = domainCounts[i] || 0;
    if (count > 0) byDomain[domains[i]] = count;
    total += count;
  }

  // Count unique agents — scan for subs:agent:* keys
  // Use a bounded scan to find agent keys
  let agentCount = 0;
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: 'subs:agent:*', count: 100 });
    cursor = String(nextCursor);
    agentCount += keys.length;
  } while (cursor !== '0');

  // Delivery stats — sample recent deliveries
  let successCount = 0;
  let failCount = 0;
  let deliveryCursor = '0';
  let scanned = 0;
  do {
    const [nextCursor, keys] = await redis.scan(deliveryCursor, { match: 'delivery:*', count: 100 });
    deliveryCursor = String(nextCursor);
    if (keys.length > 0) {
      const dp = redis.pipeline();
      for (const k of keys) dp.get(k);
      const vals = await dp.exec();
      for (const v of vals) {
        if (!v) continue;
        const rec = typeof v === 'string' ? JSON.parse(v) : v;
        if (rec.status === 'success') successCount++;
        else if (rec.status === 'failed') failCount++;
      }
    }
    scanned += keys.length;
    if (scanned >= 1000) break; // cap scan depth
  } while (deliveryCursor !== '0');

  const totalDeliveries = successCount + failCount;

  return {
    totalSubscriptions: total,
    byDomain,
    activeAgents: agentCount,
    deliveries: {
      total: totalDeliveries,
      success: successCount,
      failed: failCount,
      successRate: totalDeliveries > 0 ? Math.round((successCount / totalDeliveries) * 10000) / 100 : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  DOMAIN_FILTERS,
  createSubscription,
  listSubscriptions,
  deleteSubscription,
  matchesFilter,
  publishEvent,
  processWebhookDelivery,
  createSSEStream,
  getSubscriptionStats,
};
