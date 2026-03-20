'use strict';

const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

class OPPClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this._manifest = null;
  }

  async fetchManifest() {
    if (this._manifest) return this._manifest;
    const res = await fetch(`${this.baseUrl}/.well-known/opp.json`);
    if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
    this._manifest = await res.json();
    return this._manifest;
  }

  async query(domain, params) {
    const manifest = await this.fetchManifest();
    const endpoint = manifest.endpoints && manifest.endpoints[domain];
    if (!endpoint) throw new Error(`Unknown domain: ${domain}`);

    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Query failed: ${res.status}`);
    return res.json();
  }

  async verify(response) {
    if (!response || !response.proof || !response.proof.signature) {
      return false;
    }

    const manifest = await this.fetchManifest();
    const publicKey = manifest.public_key;
    if (!publicKey) throw new Error('No public key in manifest');

    const keyObject = crypto.createPublicKey({
      key: Buffer.from(publicKey, 'base64'),
      format: 'der',
      type: 'spki'
    });

    const payload = Object.assign({}, response);
    delete payload.proof;
    const data = Buffer.from(JSON.stringify(payload), 'utf8');
    const signature = Buffer.from(response.proof.signature, 'base64');

    return crypto.verify(null, data, keyObject, signature);
  }

  async listDomains() {
    const manifest = await this.fetchManifest();
    return Object.keys(manifest.endpoints || {});
  }

  async ask(question) {
    const res = await fetch(`${this.baseUrl}/v1/ask?q=${encodeURIComponent(question)}`);
    if (!res.ok) throw new Error(`Ask failed: ${res.status}`);
    return res.json();
  }

  async subscribe(domain, filter, callbackUrl) {
    const res = await fetch(`${this.baseUrl}/v1/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, filter, callback_url: callbackUrl })
    });
    if (!res.ok) throw new Error(`Subscribe failed: ${res.status}`);
    return res.json();
  }

  clearCache() {
    this._manifest = null;
  }
}

module.exports = { OPPClient };
