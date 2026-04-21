/**
 * action.js — Action layer (Layer 4) for Open Primitive Protocol
 *
 * Actions are things the agent does after resolving an intent:
 *   - Subscribe to ongoing monitoring
 *   - Send a notification
 *   - Register a preference with a service
 *   - Request data on a schedule
 *
 * Redis keys:
 *   action:{actionId}         — hash of action object
 *   actions:agent:{agentId}   — sorted set of actionIds by creation time
 *   actions:intent:{intentId} — sorted set of actionIds tied to an intent
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
// Constants
// ---------------------------------------------------------------------------

const VALID_TYPES = ['subscribe', 'notify', 'schedule', 'register'];
const DOMAIN_TIMEOUT_MS = 10000;

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateActionId() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `opp_x_${ts}${rand}`;
}

// ---------------------------------------------------------------------------
// Timeout wrapper
// ---------------------------------------------------------------------------

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// ---------------------------------------------------------------------------
// createAction
// ---------------------------------------------------------------------------

async function createAction(env, { intentId, agentId, type, config }) {
  if (!agentId) throw new Error('agentId is required');
  if (!type) throw new Error('type is required');
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`Invalid action type: ${type}. Valid: ${VALID_TYPES.join(', ')}`);
  }

  const redis = getRedis(env);
  const actionId = generateActionId();
  const now = new Date().toISOString();

  const action = {
    actionId,
    intentId: intentId || null,
    agentId,
    type,
    config: config || {},
    status: 'pending',
    created: now,
    lastExecuted: null,
  };

  await redis.set(`action:${actionId}`, JSON.stringify(action));
  await redis.zadd(`actions:agent:${agentId}`, { score: Date.now(), member: actionId });
  if (intentId) {
    await redis.zadd(`actions:intent:${intentId}`, { score: Date.now(), member: actionId });
  }

  return { actionId, status: 'pending' };
}

// ---------------------------------------------------------------------------
// executeAction
// ---------------------------------------------------------------------------

async function executeAction(env, actionId, sourceModules) {
  const redis = getRedis(env);
  const raw = await redis.get(`action:${actionId}`);
  if (!raw) throw new Error('Action not found');

  const action = typeof raw === 'string' ? JSON.parse(raw) : raw;

  let result;
  const now = new Date().toISOString();

  try {
    switch (action.type) {
      case 'subscribe': {
        // Create a subscription via the subscriptions module if available
        const cfg = action.config;
        if (sourceModules.subscriptions && cfg.domain && cfg.webhookUrl) {
          result = await withTimeout(
            sourceModules.subscriptions.createSubscription(env, {
              agentId: action.agentId,
              domain: cfg.domain,
              filter: cfg.filter || {},
              webhookUrl: cfg.webhookUrl,
              format: cfg.format || 'opp',
            }),
            DOMAIN_TIMEOUT_MS,
          );
          action.status = 'active';
        } else {
          result = { status: 'deferred', reason: 'subscription module or config incomplete' };
          action.status = 'pending';
        }
        break;
      }

      case 'notify': {
        // Fire a webhook notification
        const cfg = action.config;
        if (cfg.webhookUrl) {
          const resp = await withTimeout(
            fetch(cfg.webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                actionId: action.actionId,
                intentId: action.intentId,
                agentId: action.agentId,
                message: cfg.message || 'Intent resolved',
                data: cfg.data || null,
                timestamp: now,
              }),
            }),
            DOMAIN_TIMEOUT_MS,
          );
          result = { status: resp.ok ? 'delivered' : 'failed', httpStatus: resp.status };
          action.status = resp.ok ? 'completed' : 'failed';
        } else {
          result = { status: 'skipped', reason: 'no webhookUrl in config' };
          action.status = 'failed';
        }
        break;
      }

      case 'schedule': {
        // Mark as active — actual scheduling handled externally by cron/triggers
        const cfg = action.config;
        result = {
          status: 'scheduled',
          interval: cfg.interval || 'daily',
          domain: cfg.domain || null,
          nextRun: cfg.nextRun || null,
        };
        action.status = 'active';
        break;
      }

      case 'register': {
        // Register a preference — store in Redis for downstream consumption
        const cfg = action.config;
        const prefKey = `preference:${action.agentId}:${cfg.key || 'default'}`;
        await redis.set(prefKey, JSON.stringify({
          agentId: action.agentId,
          intentId: action.intentId,
          value: cfg.value || null,
          registeredAt: now,
        }));
        result = { status: 'registered', key: prefKey };
        action.status = 'completed';
        break;
      }

      default:
        result = { status: 'unknown_type' };
        action.status = 'failed';
    }
  } catch (err) {
    result = { status: 'error', error: err.message };
    action.status = 'failed';
  }

  action.lastExecuted = now;
  await redis.set(`action:${actionId}`, JSON.stringify(action));

  return { result, action };
}

// ---------------------------------------------------------------------------
// listActions
// ---------------------------------------------------------------------------

async function listActions(env, agentId) {
  const redis = getRedis(env);
  const ids = await redis.zrange(`actions:agent:${agentId}`, 0, -1, { rev: true });
  if (!ids || ids.length === 0) return { actions: [] };

  const actions = [];
  for (const id of ids) {
    const raw = await redis.get(`action:${id}`);
    if (raw) {
      actions.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
    }
  }

  return { actions };
}

// ---------------------------------------------------------------------------
// cancelAction
// ---------------------------------------------------------------------------

async function cancelAction(env, actionId) {
  const redis = getRedis(env);
  const raw = await redis.get(`action:${actionId}`);
  if (!raw) throw new Error('Action not found');

  const action = typeof raw === 'string' ? JSON.parse(raw) : raw;
  action.status = 'cancelled';
  await redis.set(`action:${actionId}`, JSON.stringify(action));

  return { cancelled: true };
}

// ---------------------------------------------------------------------------
// getAction
// ---------------------------------------------------------------------------

async function getAction(env, actionId) {
  const redis = getRedis(env);
  const raw = await redis.get(`action:${actionId}`);
  if (!raw) throw new Error('Action not found');
  const action = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return { action };
}

module.exports = { createAction, executeAction, listActions, cancelAction, getAction };
