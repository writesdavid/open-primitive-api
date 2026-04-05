/**
 * archive-temporal.js — Versioned temporal storage for Open Primitive API
 *
 * Every data point keeps a complete history of changes over time.
 * Built on Upstash Redis sorted sets. Designed for detecting silent
 * government data edits and maintaining an auditable change record.
 */

const TTL_SECONDS = 730 * 24 * 60 * 60; // 2 years

// ---------------------------------------------------------------------------
// Redis client (reuses @upstash/redis pattern from worker/index.js)
// ---------------------------------------------------------------------------

let _redis = null;
function getRedis(env) {
  if (_redis) return _redis;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { Redis } = require('@upstash/redis');
  _redis = new Redis({ url, token });
  return _redis;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sha256(input) {
  const data = typeof input === 'string' ? input : JSON.stringify(input);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function temporalKey(domain, key) {
  return `temporal:${domain}:${key}`;
}

function changelogKey(domain) {
  return `changelog:${domain}`;
}

/**
 * Flatten a nested object into dot-notation paths.
 *   { a: { b: 1 }, c: [2,3] } => { 'a.b': 1, 'c.0': 2, 'c.1': 3 }
 */
function flatten(obj, prefix = '', out = {}) {
  if (obj === null || obj === undefined) {
    out[prefix] = obj;
    return out;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      flatten(obj[i], prefix ? `${prefix}.${i}` : `${i}`, out);
    }
    return out;
  }
  if (typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      flatten(obj[k], prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  out[prefix] = obj;
  return out;
}

/**
 * Compute a structured diff between two plain values (already JSON-parsed).
 */
function computeDiff(oldData, newData) {
  const oldFlat = flatten(oldData);
  const newFlat = flatten(newData);
  const allKeys = new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)]);

  const added = {};
  const removed = {};
  const changed = {};

  for (const k of allKeys) {
    const inOld = k in oldFlat;
    const inNew = k in newFlat;
    if (!inOld && inNew) {
      added[k] = newFlat[k];
    } else if (inOld && !inNew) {
      removed[k] = oldFlat[k];
    } else if (JSON.stringify(oldFlat[k]) !== JSON.stringify(newFlat[k])) {
      changed[k] = { old: oldFlat[k], new: newFlat[k] };
    }
  }

  const hasChanges = Object.keys(added).length > 0 ||
    Object.keys(removed).length > 0 ||
    Object.keys(changed).length > 0;

  return { added, removed, changed, hasChanges };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store a new version of a record.
 */
async function storeVersion(env, domain, key, data) {
  const redis = getRedis(env);
  if (!redis) throw new Error('Redis not configured');

  const rKey = temporalKey(domain, key);
  const now = Date.now();
  const hash = await sha256(data);

  // Determine next version number by counting existing members
  const count = await redis.zcard(rKey);
  const version = count + 1;

  const entry = JSON.stringify({
    data,
    hash,
    timestamp: new Date(now).toISOString(),
    version,
  });

  // Store as sorted set member, score = timestamp ms
  await redis.zadd(rKey, { score: now, member: entry });

  // Set TTL (refreshed on every write)
  await redis.expire(rKey, TTL_SECONDS);

  // Append to domain changelog
  const clKey = changelogKey(domain);
  const changeType = version === 1 ? 'created' : 'updated';

  let fieldsSummary = null;
  if (version > 1) {
    // Get previous version to compute diff summary
    const prev = await redis.zrange(rKey, -2, -2);
    if (prev && prev.length > 0) {
      try {
        const prevEntry = typeof prev[0] === 'string' ? JSON.parse(prev[0]) : prev[0];
        const diff = computeDiff(prevEntry.data, data);
        const parts = [];
        const addedCount = Object.keys(diff.added).length;
        const removedCount = Object.keys(diff.removed).length;
        const changedCount = Object.keys(diff.changed).length;
        if (addedCount) parts.push(`+${addedCount}`);
        if (removedCount) parts.push(`-${removedCount}`);
        if (changedCount) parts.push(`~${changedCount}`);
        fieldsSummary = parts.join(' ') || 'no field changes';
      } catch (_) {
        fieldsSummary = 'diff unavailable';
      }
    }
  }

  const clEntry = JSON.stringify({
    key,
    timestamp: new Date(now).toISOString(),
    changeType,
    fieldsSummary,
    version,
  });

  await redis.zadd(clKey, { score: now, member: clEntry });
  await redis.expire(clKey, TTL_SECONDS);

  return { key: rKey, version, hash, timestamp: new Date(now).toISOString() };
}

/**
 * Retrieve version history for a record.
 */
async function getHistory(env, domain, key, opts = {}) {
  const redis = getRedis(env);
  if (!redis) throw new Error('Redis not configured');

  const rKey = temporalKey(domain, key);
  const from = opts.from || 0;
  const to = opts.to || '+inf';
  const limit = opts.limit || 100;

  const raw = await redis.zrangebyscore(rKey, from, to, { count: limit, offset: 0 });

  const entries = raw.map(r => {
    try { return typeof r === 'string' ? JSON.parse(r) : r; } catch (_) { return r; }
  });

  // Attach diff from previous version
  for (let i = 0; i < entries.length; i++) {
    if (i === 0) {
      entries[i].diff = null;
    } else {
      entries[i].diff = computeDiff(entries[i - 1].data, entries[i].data);
    }
  }

  return entries;
}

/**
 * Compute diff between two specific versions.
 */
async function getDiff(env, domain, key, versionA, versionB) {
  const redis = getRedis(env);
  if (!redis) throw new Error('Redis not configured');

  const rKey = temporalKey(domain, key);
  const all = await redis.zrange(rKey, 0, -1);

  const entries = all.map(r => {
    try { return typeof r === 'string' ? JSON.parse(r) : r; } catch (_) { return r; }
  });

  const a = entries.find(e => e.version === versionA);
  const b = entries.find(e => e.version === versionB);

  if (!a) throw new Error(`Version ${versionA} not found`);
  if (!b) throw new Error(`Version ${versionB} not found`);

  return {
    from: { version: a.version, timestamp: a.timestamp },
    to: { version: b.version, timestamp: b.timestamp },
    diff: computeDiff(a.data, b.data),
  };
}

/**
 * Return the most recent version of a record.
 */
async function getLatest(env, domain, key) {
  const redis = getRedis(env);
  if (!redis) throw new Error('Redis not configured');

  const rKey = temporalKey(domain, key);
  const raw = await redis.zrange(rKey, -1, -1);

  if (!raw || raw.length === 0) return null;

  try {
    return typeof raw[0] === 'string' ? JSON.parse(raw[0]) : raw[0];
  } catch (_) {
    return raw[0];
  }
}

/**
 * Compare new data against the latest stored version.
 * Core function for detecting silent data edits.
 */
async function detectChanges(env, domain, key, newData) {
  const latest = await getLatest(env, domain, key);

  if (!latest) {
    return {
      changed: true,
      diff: { added: flatten(newData), removed: {}, changed: {}, hasChanges: true },
      previousVersion: null,
      previousTimestamp: null,
    };
  }

  const diff = computeDiff(latest.data, newData);

  return {
    changed: diff.hasChanges,
    diff,
    previousVersion: latest.version,
    previousTimestamp: latest.timestamp,
  };
}

/**
 * Return recent changes across all keys in a domain.
 */
async function getChangelog(env, domain, opts = {}) {
  const redis = getRedis(env);
  if (!redis) throw new Error('Redis not configured');

  const clKey = changelogKey(domain);
  const since = opts.since || 0;
  const limit = opts.limit || 50;

  // Return newest first via ZREVRANGEBYSCORE
  const raw = await redis.zrangebyscore(clKey, since, '+inf', { count: limit, offset: 0 });

  return raw.map(r => {
    try { return typeof r === 'string' ? JSON.parse(r) : r; } catch (_) { return r; }
  }).reverse();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  storeVersion,
  getHistory,
  getDiff,
  getLatest,
  detectChanges,
  getChangelog,
  computeDiff,
  flatten,
};
