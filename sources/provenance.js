const crypto = require('crypto');

/**
 * Hash arbitrary content with SHA-256.
 * Accepts string, ArrayBuffer, or Buffer-like input.
 * Returns 'sha256:<hex>' string.
 */
async function hashContent(content) {
  let data;
  if (typeof content === 'string') {
    data = new TextEncoder().encode(content);
  } else if (content instanceof ArrayBuffer) {
    data = new Uint8Array(content);
  } else if (ArrayBuffer.isView(content)) {
    data = new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  } else {
    data = new TextEncoder().encode(JSON.stringify(content));
  }
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

/**
 * Extract relevant HTTP headers from a Response object.
 */
function extractHeaders(response) {
  const get = (name) => response.headers.get(name) || null;
  return {
    date: get('date'),
    etag: get('etag'),
    lastModified: get('last-modified'),
    contentType: get('content-type'),
    server: get('server'),
  };
}

/**
 * Attempt to extract TLS certificate hash from the Cloudflare `cf` object
 * attached to the request or response. Returns null when unavailable.
 */
function extractTlsCertHash(response) {
  try {
    const cf = response.cf;
    if (cf && cf.tlsClientAuth && cf.tlsClientAuth.certFingerprintSHA256) {
      return cf.tlsClientAuth.certFingerprintSHA256;
    }
  } catch { /* not available outside CF Workers */ }
  return null;
}

/**
 * Infer the origin actor name from the URL hostname.
 */
function inferActor(url) {
  const hostname = new URL(url).hostname;
  const map = {
    'api.fda.gov': 'US FDA',
    'enviro.epa.gov': 'US EPA',
    'data.epa.gov': 'US EPA',
    'api.weather.gov': 'US NWS',
    'earthquake.usgs.gov': 'USGS',
    'clinicaltrials.gov': 'US NIH',
    'dailymed.nlm.nih.gov': 'US NLM',
    'efts.sec.gov': 'US SEC',
    'api.usa.gov': 'US GSA',
    'data.cdc.gov': 'US CDC',
    'nhtsa.gov': 'US NHTSA',
    'api.data.gov': 'US Data.gov',
  };
  for (const [domain, actor] of Object.entries(map)) {
    if (hostname.includes(domain)) return actor;
  }
  return hostname;
}

/**
 * Wrap a fetch call to capture provenance metadata.
 *
 * @param {string} url - The upstream URL to fetch.
 * @param {object} opts
 * @param {string} opts.source - Human-readable source name (e.g. 'FDA FAERS').
 * @param {string} opts.domain - Domain category (e.g. 'drugs').
 * @param {object} [opts.fetchOptions] - Additional options passed to fetch().
 * @param {number} [opts.timeout] - Abort timeout in ms (default 12000).
 * @returns {{ data: any, raw: string, provenance: object }}
 */
async function withProvenance(url, opts = {}) {
  const { source, domain, fetchOptions = {}, timeout = 12000 } = opts;
  const fetchedAt = new Date().toISOString();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);

  let response;
  try {
    response = await fetch(url, { ...fetchOptions, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  const responseHash = await hashContent(raw);
  const httpHeaders = extractHeaders(response);
  const tlsCertHash = extractTlsCertHash(response);

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  const provenance = {
    upstream: {
      url,
      fetchedAt,
      responseHash,
      httpHeaders,
      tlsCertHash,
    },
    chain: [
      {
        actor: inferActor(url),
        type: 'origin',
        url,
        timestamp: httpHeaders.date || fetchedAt,
      },
      {
        actor: 'Open Primitive',
        type: 'intermediary',
        responseHash,
        timestamp: fetchedAt,
      },
    ],
    source: source || null,
    domain: domain || null,
    verification: {
      method: 'sha256-content-hash + ed25519-envelope-signature',
      publicKey: 'https://api.openprimitive.com/.well-known/opp.json#publicKey',
      note: 'Full TLSNotary attestation planned — current chain uses content hashing as interim proof',
    },
  };

  return { data, raw, provenance };
}

/**
 * Verify that a provenance object's hash matches the given content.
 *
 * @param {object} provenance - A provenance object produced by withProvenance.
 * @param {string|ArrayBuffer|Uint8Array} content - The response body to verify.
 * @returns {{ valid: boolean, expected: string, actual: string }}
 */
async function verifyProvenance(provenance, content) {
  const actual = await hashContent(content);
  const expected = provenance.upstream.responseHash;
  return {
    valid: actual === expected,
    expected,
    actual,
  };
}

module.exports = { withProvenance, hashContent, verifyProvenance };
