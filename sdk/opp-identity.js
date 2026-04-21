/**
 * opp-identity.js — Lightweight client SDK for OPP Agent Identity (Layer 2)
 *
 * Fully decentralized. No registration step. The keypair IS the identity.
 *
 * Zero dependencies. Works in Node 18+ and modern browsers.
 * Uses Web Crypto API (crypto.subtle) for Ed25519 operations.
 *
 * Usage:
 *   const { OPPIdentity } = require('./opp-identity');
 *   const id = new OPPIdentity();
 *   await id.init();                       // generates keypair, derives agentId
 *   const headers = await id.headers('request body');  // sign + get headers
 *   fetch(url, { headers, body: 'request body' });
 *
 * Or restore from saved keys:
 *   const id = new OPPIdentity();
 *   await id.init({ publicKey, privateKey });
 */

const S = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto.subtle : null;

class OPPIdentity {
  constructor(baseUrl) {
    this.base = (baseUrl || 'https://api.openprimitive.com').replace(/\/$/, '');
    this.publicKey = null;
    this.privateKey = null;
    this.agentId = null;
    this.handle = 'anonymous';
  }

  /**
   * Initialize the identity. Generates a new keypair or restores from saved keys.
   *
   * @param {object} [opts] — { publicKey, privateKey, handle } to restore existing identity
   * @returns {{ agentId, publicKey }}
   */
  async init(opts) {
    if (opts && opts.publicKey && opts.privateKey) {
      this.publicKey = opts.publicKey;
      this.privateKey = opts.privateKey;
    } else {
      const kp = await this.generateKeypair();
      this.publicKey = kp.publicKey;
      this.privateKey = kp.privateKey;
    }
    if (opts && opts.handle) this.handle = opts.handle;
    this.agentId = await this._deriveAgentId(this.publicKey);
    return { agentId: this.agentId, publicKey: this.publicKey };
  }

  /** Generate a new Ed25519 keypair (local, no network). */
  async generateKeypair() {
    const kp = await S.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const pub = new Uint8Array(await S.exportKey('raw', kp.publicKey));
    const priv = new Uint8Array(await S.exportKey('pkcs8', kp.privateKey));
    return { publicKey: b64(pub), privateKey: b64(priv) };
  }

  /**
   * Sign a payload and return the OPP request headers.
   * Attach these to any fetch() call to authenticate as this agent.
   *
   * @param {string} body — the request body to sign
   * @returns {object} — headers object with X-OPP-PublicKey, X-OPP-Signature, X-OPP-Timestamp
   */
  async headers(body) {
    if (!this.privateKey || !this.publicKey) {
      throw new Error('Call init() before signing requests');
    }
    const { signature, timestamp } = await this.sign(this.privateKey, body || '');
    return {
      'X-OPP-PublicKey': this.publicKey,
      'X-OPP-Signature': signature,
      'X-OPP-Timestamp': timestamp,
      'Content-Type': 'application/json',
    };
  }

  /** Sign a payload string with a private key. */
  async sign(privateKeyB64, payload) {
    const keyBytes = unb64(privateKeyB64);
    const key = await S.importKey('pkcs8', keyBytes, { name: 'Ed25519' }, false, ['sign']);
    const ts = new Date().toISOString();
    const msg = new TextEncoder().encode(`${ts}:${payload}`);
    const sig = new Uint8Array(await S.sign({ name: 'Ed25519' }, key, msg));
    return { signature: b64(sig), timestamp: ts };
  }

  /**
   * Make an authenticated request to any OPP-compatible service.
   *
   * @param {string} url — full URL
   * @param {object} [opts] — { method, body }
   * @returns {Promise<object>} — parsed JSON response
   */
  async request(url, opts = {}) {
    const method = opts.method || 'POST';
    const body = opts.body ? JSON.stringify(opts.body) : '';
    const hdrs = await this.headers(body);
    const res = await fetch(url, { method, headers: hdrs, body: body || undefined });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `${method} ${url} failed: ${res.status}`);
    }
    return res.json();
  }

  /**
   * Cache preferences on an OPP service (optional convenience).
   *
   * @param {object} preferences
   * @returns {Promise<object>}
   */
  async updatePreferences(preferences) {
    const payload = JSON.stringify(preferences);
    const { signature, timestamp } = await this.sign(this.privateKey, payload);
    const res = await fetch(`${this.base}/v1/identity/${this.agentId}/preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-OPP-PublicKey': this.publicKey,
        'X-OPP-Signature': signature,
        'X-OPP-Timestamp': timestamp,
      },
      body: JSON.stringify({ signature, timestamp, preferences }),
    });
    if (!res.ok) throw new Error(`PUT preferences failed: ${res.status}`);
    return res.json();
  }

  /**
   * Get cached preferences from an OPP service (optional convenience).
   *
   * @returns {Promise<object>}
   */
  async getPreferences() {
    const res = await fetch(`${this.base}/v1/identity/${this.agentId}`);
    if (!res.ok) throw new Error(`GET identity failed: ${res.status}`);
    return res.json();
  }

  /** Export the keypair for local storage. */
  export() {
    return {
      agentId: this.agentId,
      publicKey: this.publicKey,
      privateKey: this.privateKey,
      handle: this.handle,
    };
  }

  async _deriveAgentId(publicKey) {
    const encoded = new TextEncoder().encode(publicKey);
    const hashBuf = await S.digest('SHA-256', encoded);
    const arr = new Uint8Array(hashBuf);
    let hex = '';
    for (let i = 0; i < 8; i++) hex += arr[i].toString(16).padStart(2, '0');
    return `opp_a_${hex}`;
  }
}

function b64(buf) {
  return btoa(String.fromCharCode(...buf));
}

function unb64(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

if (typeof module !== 'undefined') module.exports = { OPPIdentity };
