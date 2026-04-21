/**
 * opp-identity.js — Lightweight client SDK for OPP Agent Identity (Layer 2)
 *
 * Zero dependencies. Works in Node 18+ and modern browsers.
 * Uses Web Crypto API (crypto.subtle) for Ed25519 operations.
 *
 * Usage:
 *   const { OPPIdentity } = require('./opp-identity');
 *   const id = new OPPIdentity('https://api.openprimitive.com');
 *   const keys = await id.generateKeypair();
 *   const reg = await id.register(keys.publicKey, 'my-agent');
 *   const signed = await id.sign(keys.privateKey, 'hello');
 *   const ok = await id.verify(reg.agentId, signed.signature, 'hello');
 */

const S = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto.subtle : null;

class OPPIdentity {
  constructor(baseUrl) {
    this.base = (baseUrl || 'https://api.openprimitive.com').replace(/\/$/, '');
  }

  /** Generate a new Ed25519 keypair (local, no network). */
  async generateKeypair() {
    const kp = await S.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const pub = new Uint8Array(await S.exportKey('raw', kp.publicKey));
    const priv = new Uint8Array(await S.exportKey('pkcs8', kp.privateKey));
    return { publicKey: b64(pub), privateKey: b64(priv) };
  }

  /** Register this agent's public key with an OPP service. */
  async register(publicKey, handle, preferences) {
    return this._post('/v1/identity/register', { publicKey, handle, preferences });
  }

  /** Sign a payload string with the agent's private key. */
  async sign(privateKeyB64, payload) {
    const keyBytes = unb64(privateKeyB64);
    const key = await S.importKey('pkcs8', keyBytes, { name: 'Ed25519' }, false, ['sign']);
    const ts = new Date().toISOString();
    const msg = new TextEncoder().encode(`${ts}:${payload}`);
    const sig = new Uint8Array(await S.sign({ name: 'Ed25519' }, key, msg));
    return { signature: b64(sig), timestamp: ts };
  }

  /** Verify a signature against a registered agent. */
  async verify(agentId, signature, payload) {
    return this._post('/v1/identity/verify', { agentId, signature, payload });
  }

  /** Get an agent's public profile and preferences. */
  async getProfile(agentId) {
    const res = await fetch(`${this.base}/v1/identity/${agentId}`);
    if (!res.ok) throw new Error(`GET identity failed: ${res.status}`);
    return res.json();
  }

  /** Update preferences (requires signing the preferences object). */
  async updatePreferences(agentId, privateKeyB64, preferences) {
    const payload = JSON.stringify(preferences);
    const { signature } = await this.sign(privateKeyB64, payload);
    const res = await fetch(`${this.base}/v1/identity/${agentId}/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature, preferences }),
    });
    if (!res.ok) throw new Error(`PUT preferences failed: ${res.status}`);
    return res.json();
  }

  async _post(path, body) {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `POST ${path} failed: ${res.status}`);
    }
    return res.json();
  }
}

function b64(buf) {
  return btoa(String.fromCharCode(...buf));
}

function unb64(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

if (typeof module !== 'undefined') module.exports = { OPPIdentity };
