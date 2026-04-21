/**
 * identity.js — Agent Identity Layer (Layer 2) for Open Primitive Protocol
 *
 * Fully decentralized. The agent IS the identity. The keypair lives on the
 * user's device. Any OPP-compatible service verifies the signature by checking
 * against the public key sent IN THE REQUEST — no central registry needed.
 *
 * How it works:
 *   1. Agent generates an Ed25519 keypair locally (generateKeypair)
 *   2. Agent creates an identity from the keypair (createIdentity)
 *   3. Every request includes X-OPP-PublicKey and X-OPP-Signature headers
 *   4. Any service calls verifyRequest(headers, body) — pure crypto, no network
 *
 * Redis is optional — used only as a convenience cache for preferences.
 * The protocol itself requires zero server-side state.
 *
 * Designed for Cloudflare Workers + nodejs_compat.
 */

const { Redis } = require('@upstash/redis');

// ---------------------------------------------------------------------------
// Redis client (optional — only for preference caching)
// ---------------------------------------------------------------------------

let _redis = null;
function getRedis(env) {
  if (_redis) return _redis;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

// ---------------------------------------------------------------------------
// Default preferences
// ---------------------------------------------------------------------------

const DEFAULT_PREFERENCES = {
  dataDensity: 'medium',
  responseFormat: 'full',
  domains: [],
  jurisdiction: 'us',
  maxFreshness: 86400,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a deterministic agentId from a public key.
 * Format: opp_a_<first 16 hex chars of SHA-256 of publicKey>
 */
async function deriveAgentId(publicKey) {
  const encoded = new TextEncoder().encode(publicKey);
  const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  const arr = new Uint8Array(hashBuf);
  let hex = '';
  for (let i = 0; i < 8; i++) hex += arr[i].toString(16).padStart(2, '0');
  return `opp_a_${hex}`;
}

/**
 * Import an Ed25519 public key from base64 for verification.
 */
async function importPublicKey(base64Key) {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  return globalThis.crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'Ed25519' },
    false,
    ['verify']
  );
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Create a new agent identity from a keypair. Stores NOTHING server-side.
 * The public key IS the identity. The agentId is derived deterministically.
 *
 * @param {object} opts — { publicKey (base64), handle }
 * @returns {{ agentId, publicKey, handle, created }}
 */
async function createIdentity({ publicKey, handle }) {
  if (!publicKey) throw new Error('publicKey is required (base64-encoded Ed25519)');

  // Validate the public key can be imported
  try {
    await importPublicKey(publicKey);
  } catch (err) {
    throw new Error(`Invalid Ed25519 public key: ${err.message}`);
  }

  const agentId = await deriveAgentId(publicKey);

  return {
    agentId,
    publicKey,
    handle: handle || 'anonymous',
    created: new Date().toISOString(),
  };
}

/**
 * Verify an agent's Ed25519 signature using the public key from the request.
 * No Redis. No network call. Pure crypto.
 *
 * @param {object} opts — { publicKey (base64), signature (base64), payload (string), timestamp (ISO string) }
 * @returns {{ valid, agentId }}
 */
async function verifyAgentSignature({ publicKey, signature, payload, timestamp }) {
  if (!publicKey || !signature || !payload) {
    throw new Error('publicKey, signature, and payload are all required');
  }

  const cryptoKey = await importPublicKey(publicKey);
  const agentId = await deriveAgentId(publicKey);

  // Reconstruct the signed message: timestamp:payload
  const message = timestamp ? `${timestamp}:${payload}` : payload;
  const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  const payloadBytes = new TextEncoder().encode(message);

  const valid = await globalThis.crypto.subtle.verify(
    { name: 'Ed25519' },
    cryptoKey,
    sigBytes,
    payloadBytes
  );

  return { valid, agentId };
}

/**
 * Verify a request's authenticity using only the headers. No Redis. No network.
 * This is the function any OPP-compatible service calls to authenticate a request.
 *
 * Expects headers:
 *   X-OPP-PublicKey — base64-encoded Ed25519 public key
 *   X-OPP-Signature — base64-encoded Ed25519 signature
 *   X-OPP-Timestamp — ISO timestamp used when signing
 *
 * @param {object} headers — request headers (or object with get() method)
 * @param {string} body — the request body string that was signed
 * @returns {{ valid, agentId, publicKey }}
 */
async function verifyRequest(headers, body) {
  const get = typeof headers.get === 'function'
    ? (k) => headers.get(k)
    : (k) => headers[k];

  const publicKey = get('X-OPP-PublicKey') || get('x-opp-publickey');
  const signature = get('X-OPP-Signature') || get('x-opp-signature');
  const timestamp = get('X-OPP-Timestamp') || get('x-opp-timestamp');

  if (!publicKey || !signature) {
    return { valid: false, agentId: null, publicKey: null };
  }

  const { valid, agentId } = await verifyAgentSignature({
    publicKey,
    signature,
    payload: body || '',
    timestamp,
  });

  return { valid, agentId, publicKey };
}

/**
 * Extract identity info from request headers. No verification — just parsing.
 *
 * @param {object} headers — request headers
 * @returns {{ agentId, publicKey } | null}
 */
async function extractIdentity(headers) {
  const get = typeof headers.get === 'function'
    ? (k) => headers.get(k)
    : (k) => headers[k];

  const publicKey = get('X-OPP-PublicKey') || get('x-opp-publickey');
  if (!publicKey) return null;

  const agentId = await deriveAgentId(publicKey);
  return { agentId, publicKey };
}

/**
 * Get an agent's preferences from Redis cache. Optional convenience.
 * Returns defaults if Redis is unavailable or agent has no cached prefs.
 *
 * @param {object} env
 * @param {string} agentId
 * @returns {{ preferences, handle, cached }}
 */
async function getPreferences(env, agentId) {
  if (!agentId) throw new Error('agentId is required');

  const redis = getRedis(env);
  if (!redis) return { preferences: { ...DEFAULT_PREFERENCES }, handle: null, cached: false };

  try {
    const raw = await redis.get(`identity:${agentId}`);
    if (!raw) return { preferences: { ...DEFAULT_PREFERENCES }, handle: null, cached: false };

    const identity = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      preferences: identity.preferences,
      handle: identity.handle,
      cached: true,
    };
  } catch {
    return { preferences: { ...DEFAULT_PREFERENCES }, handle: null, cached: false };
  }
}

/**
 * Cache an agent's preferences in Redis. Optional convenience.
 * Requires a valid signature over the JSON-stringified preferences.
 *
 * @param {object} env
 * @param {string} publicKey — base64 public key
 * @param {string} signature — base64 signature over JSON.stringify(preferences)
 * @param {string} timestamp — ISO timestamp used when signing
 * @param {object} preferences — preferences to cache
 * @returns {{ updated }}
 */
async function updatePreferences(env, publicKey, signature, timestamp, preferences) {
  if (!publicKey || !signature || !preferences) {
    throw new Error('publicKey, signature, and preferences are all required');
  }

  const payload = JSON.stringify(preferences);
  const { valid, agentId } = await verifyAgentSignature({
    publicKey,
    signature,
    payload,
    timestamp,
  });
  if (!valid) throw new Error('Invalid signature');

  const redis = getRedis(env);
  if (!redis) return { updated: false, reason: 'no cache available' };

  const existing = await redis.get(`identity:${agentId}`);
  const identity = existing
    ? (typeof existing === 'string' ? JSON.parse(existing) : existing)
    : { agentId, publicKey, handle: 'anonymous', preferences: { ...DEFAULT_PREFERENCES } };

  identity.preferences = { ...identity.preferences, ...preferences };
  identity.lastSeen = new Date().toISOString();

  await redis.set(`identity:${agentId}`, JSON.stringify(identity));

  return { updated: true };
}

/**
 * Generate a new Ed25519 keypair. Helper for clients.
 *
 * @returns {{ publicKey, privateKey }} — both base64-encoded
 */
async function generateKeypair() {
  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  );

  const publicRaw = await globalThis.crypto.subtle.exportKey('raw', keyPair.publicKey);
  const privateRaw = await globalThis.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: btoa(String.fromCharCode(...new Uint8Array(publicRaw))),
    privateKey: btoa(String.fromCharCode(...new Uint8Array(privateRaw))),
  };
}

/**
 * Create a signed request payload. Helper for clients.
 *
 * @param {string} privateKeyBase64 — base64-encoded PKCS8 private key
 * @param {string} payload — the string to sign
 * @returns {{ signature, timestamp }}
 */
async function signRequest(privateKeyBase64, payload) {
  const keyBytes = Uint8Array.from(atob(privateKeyBase64), (c) => c.charCodeAt(0));
  const privateKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  const timestamp = new Date().toISOString();
  const message = `${timestamp}:${payload}`;
  const sigBuf = await globalThis.crypto.subtle.sign(
    { name: 'Ed25519' },
    privateKey,
    new TextEncoder().encode(message)
  );

  return {
    signature: btoa(String.fromCharCode(...new Uint8Array(sigBuf))),
    timestamp,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createIdentity,
  verifyAgentSignature,
  verifyRequest,
  extractIdentity,
  getPreferences,
  updatePreferences,
  generateKeypair,
  signRequest,
  deriveAgentId,
  DEFAULT_PREFERENCES,
};
