'use strict';

const crypto = require('crypto');
const fs = require('fs');

class OPPProvider {
  constructor(config) {
    this.name = config.name;
    this.version = config.version || '1.0';
    this.contact = config.contact || null;
    this.baseUrl = config.baseUrl || null;

    if (config.privateKeyPath) {
      const pem = fs.readFileSync(config.privateKeyPath, 'utf8');
      this._privateKey = crypto.createPrivateKey(pem);
    } else if (config.privateKey) {
      this._privateKey = config.privateKey;
    } else {
      this._privateKey = null;
    }

    if (this._privateKey) {
      this._publicKey = crypto.createPublicKey(this._privateKey);
    }
  }

  wrap(domain, data, metadata) {
    const response = {
      opp_version: this.version,
      provider: this.name,
      domain: domain,
      timestamp: new Date().toISOString(),
      data: data,
      metadata: {
        source: metadata.source || null,
        source_url: metadata.source_url || null,
        license: metadata.license || null,
        retrieved_at: metadata.retrieved_at || new Date().toISOString()
      },
      confidence: null,
      citations: null
    };

    if (this._privateKey) {
      const payload = Buffer.from(JSON.stringify(response), 'utf8');
      const signature = crypto.sign(null, payload, this._privateKey);
      response.proof = {
        type: 'Ed25519',
        signature: signature.toString('base64'),
        signed_at: new Date().toISOString()
      };
    }

    return response;
  }

  generateManifest(domains) {
    const endpoints = {};
    for (const d of domains) {
      endpoints[d] = `/v1/${d}`;
    }

    const manifest = {
      opp_version: this.version,
      provider: this.name,
      contact: this.contact,
      endpoints: endpoints,
      ask: '/v1/ask',
      subscribe: '/v1/subscribe'
    };

    if (this._publicKey) {
      const der = this._publicKey.export({ format: 'der', type: 'spki' });
      manifest.public_key = der.toString('base64');
    }

    return manifest;
  }

  addConfidence(response, completeness, methodology, note) {
    response.confidence = {
      completeness: completeness,
      methodology: methodology,
      note: note || null
    };
    return this._resign(response);
  }

  addCitation(response, statement, sourceUrl, license) {
    if (!response.citations) {
      response.citations = [];
    }
    response.citations.push({
      statement: statement,
      source_url: sourceUrl,
      license: license || null
    });
    return this._resign(response);
  }

  _resign(response) {
    if (!this._privateKey) return response;
    const copy = Object.assign({}, response);
    delete copy.proof;
    const payload = Buffer.from(JSON.stringify(copy), 'utf8');
    const signature = crypto.sign(null, payload, this._privateKey);
    response.proof = {
      type: 'Ed25519',
      signature: signature.toString('base64'),
      signed_at: new Date().toISOString()
    };
    return response;
  }
}

module.exports = { OPPProvider };
