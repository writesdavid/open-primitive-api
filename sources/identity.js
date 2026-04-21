/**
 * identity.js — Agent Identity Layer (Layer 2) for Open Primitive Protocol
 *
 * Handles agent identity registration, verification, and preference storage.
 * An Agent Identity is a portable Ed25519 keypair that represents a person's agent.
 * Any OPP-compatible service can verify the identity — it is not tied to Open Primitive.
 *
 * Uses Upstash Redis (env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN).
 * Designed for Cloudflare Workers + nodejs_compat.
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
 * Register a new agent identity.
 *
 * @param {object} env — Worker environment bindings
 * @param {object} opts — { publicKey (base64), handle, preferences }
 * @returns {{ agentId, registered, verificationUrl }}
 */
async function registerIdentity(env, { publicKey, handle, preferences }) {
  if (!publicKey) throw new Error('publicKey is required (base64-encoded Ed25519)');

  const redis = getRedis(env);
  const agentId = await deriveAgentId(publicKey);
  const now = new Date().toISOString();

  // Check for duplicate registration
  const existing = await redis.get(`identity:${agentId}`);
  if (existing) {
    throw new Error(`Identity already registered: ${agentId}`);
  }

  // Validate the public key can be imported
  try {
    await importPublicKey(publicKey);
  } catch (err) {
    throw new Error(`Invalid Ed25519 public key: ${err.message}`);
  }

  const identity = {
    agentId,
    publicKey,
    handle: handle || 'anonymous',
    preferences: { ...DEFAULT_PREFERENCES, ...(preferences || {}) },
    registered: now,
    lastSeen: now,
  };

  // Store identity + reverse index from publicKey → agentId
  await Promise.all([
    redis.set(`identity:${agentId}`, JSON.stringify(identity)),
    redis.set(`identity:key:${publicKey}`, agentId),
  ]);

  return {
    agentId,
    registered: now,
    verificationUrl: `https://api.openprimitive.com/v1/identity/${agentId}`,
  };
}

/**
 * Verify an agent's Ed25519 signature on a payload.
 *
 * @param {object} env
 * @param {object} opts — { agentId, signature (base64), payload (string) }
 * @returns {{ valid, identity }}
 */
async function verifyAgentSignature(env, { agentId, signature, payload }) {
  if (!agentId || !signature || !payload) {
    throw new Error('agentId, signature, and payload are all required');
  }

  const redis = getRedis(env);
  const raw = await redis.get(`identity:${agentId}`);
  if (!raw) return { valid: false, identity: null };

  const identity = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const publicKey = await importPublicKey(identity.publicKey);

  const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  const payloadBytes = new TextEncoder().encode(payload);

  const valid = await globalThis.crypto.subtle.verify(
    { name: 'Ed25519' },
    publicKey,
    sigBytes,
    payloadBytes
  );

  // Update lastSeen on successful verification
  if (valid) {
    identity.lastSeen = new Date().toISOString();
    await redis.set(`identity:${agentId}`, JSON.stringify(identity));
  }

  // Return public info only
  return {
    valid,
    identity: {
      agentId: identity.agentId,
      handle: identity.handle,
      registered: identity.registered,
      lastSeen: identity.lastSeen,
    },
  };
}

/**
 * Get an agent's registered preferences and public profile.
 *
 * @param {object} env
 * @param {string} agentId
 * @returns {{ preferences, handle, registered }}
 */
async function getPreferences(env, agentId) {
  if (!agentId) throw new Error('agentId is required');

  const redis = getRedis(env);
  const raw = await redis.get(`identity:${agentId}`);
  if (!raw) return null;

  const identity = typeof raw === 'string' ? JSON.parse(raw) : raw;

  return {
    preferences: identity.preferences,
    handle: identity.handle,
    registered: identity.registered,
  };
}

/**
 * Update an agent's preferences. Requires a valid signature over the
 * JSON-stringified new preferences object.
 *
 * @param {object} env
 * @param {string} agentId
 * @param {string} signature — base64-encoded Ed25519 signature
 * @param {object} preferences — new preferences to merge
 * @returns {{ updated }}
 */
async function updatePreferences(env, agentId, signature, preferences) {
  if (!agentId || !signature || !preferences) {
    throw new Error('agentId, signature, and preferences are all required');
  }

  const payload = JSON.stringify(preferences);
  const { valid } = await verifyAgentSignature(env, { agentId, signature, payload });
  if (!valid) throw new Error('Invalid signature');

  const redis = getRedis(env);
  const raw = await redis.get(`identity:${agentId}`);
  if (!raw) throw new Error('Identity not found');

  const identity = typeof raw === 'string' ? JSON.parse(raw) : raw;
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
  registerIdentity,
  verifyAgentSignature,
  getPreferences,
  updatePreferences,
  generateKeypair,
  signRequest,
  DEFAULT_PREFERENCES,
};
