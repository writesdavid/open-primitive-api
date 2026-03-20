/**
 * OPP Validator
 * Checks whether an endpoint conforms to the Open Primitive Protocol spec.
 *
 * Usage:
 *   const { validateProvider } = require('./sdk/opp-validator');
 *   const result = await validateProvider('https://api.openprimitive.com');
 *   console.log(result.level);  // 'Level 3 (Verified)'
 *   console.log(result.checks); // array of pass/fail checks
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fetchJSON(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function isValidURL(s) {
  try { new URL(s); return true; } catch (_) { return false; }
}

function isISO8601(s) {
  if (typeof s !== 'string') return false;
  const d = new Date(s);
  return !isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}/.test(s);
}

// ---------------------------------------------------------------------------
// Check runner
// ---------------------------------------------------------------------------

function check(name, passed, detail) {
  return { name, passed: !!passed, detail: detail || null };
}

// ---------------------------------------------------------------------------
// Level 1 — Basic
// ---------------------------------------------------------------------------

async function checkLevel1(baseURL) {
  const checks = [];
  let manifest = null;
  let queryResponse = null;

  // 1. Manifest exists
  const manifestURL = baseURL.replace(/\/+$/, '') + '/.well-known/opp.json';
  let manifestRaw;
  try {
    manifestRaw = await fetchJSON(manifestURL);
    checks.push(check('manifest_exists', manifestRaw.status === 200,
      manifestRaw.status === 200 ? null : `HTTP ${manifestRaw.status}`));
  } catch (e) {
    checks.push(check('manifest_exists', false, e.message));
    // Can't continue without manifest
    return { checks, manifest, queryResponse };
  }

  // 2. Valid JSON
  try {
    manifest = JSON.parse(manifestRaw.body);
    checks.push(check('manifest_valid_json', true));
  } catch (e) {
    checks.push(check('manifest_valid_json', false, 'Parse error'));
    return { checks, manifest, queryResponse };
  }

  // 3. Required top-level fields
  const requiredFields = ['@context', 'name', 'provider', 'domains', 'endpoints'];
  for (const field of requiredFields) {
    const key = field.replace('@', '');
    checks.push(check(`manifest_has_${key}`, manifest[field] !== undefined));
  }

  // 4. Each domain has id, name, source
  const domains = Array.isArray(manifest.domains) ? manifest.domains : [];
  if (domains.length === 0) {
    checks.push(check('domains_have_required_fields', false, 'No domains found'));
  } else {
    const allValid = domains.every(d => d.id && d.name && d.source);
    checks.push(check('domains_have_required_fields', allValid,
      allValid ? null : 'Missing id, name, or source in one or more domains'));
  }

  // 5. Query endpoint returns JSON
  const endpoints = manifest.endpoints || {};
  const queryPath = endpoints.query || '/query';
  const firstDomain = domains[0];
  if (firstDomain) {
    const queryURL = baseURL.replace(/\/+$/, '') + queryPath + '?domain=' + encodeURIComponent(firstDomain.id);
    try {
      const qRes = await fetchJSON(queryURL);
      let parsed;
      try {
        parsed = JSON.parse(qRes.body);
        checks.push(check('query_returns_json', true));
        queryResponse = parsed;
      } catch (_) {
        checks.push(check('query_returns_json', false, 'Response is not valid JSON'));
      }

      if (queryResponse) {
        // 6. Response has required fields
        checks.push(check('response_has_domain', queryResponse.domain !== undefined));
        checks.push(check('response_has_source', queryResponse.source !== undefined));
        checks.push(check('response_has_source_url', queryResponse.source_url !== undefined));
        checks.push(check('response_has_freshness', queryResponse.freshness !== undefined));

        // 7. freshness is ISO 8601
        checks.push(check('freshness_is_iso8601', isISO8601(queryResponse.freshness),
          queryResponse.freshness));

        // 8. source_url is valid URL
        checks.push(check('source_url_is_valid', isValidURL(queryResponse.source_url),
          queryResponse.source_url));
      }
    } catch (e) {
      checks.push(check('query_returns_json', false, e.message));
    }
  } else {
    checks.push(check('query_returns_json', false, 'No domains to test against'));
  }

  return { checks, manifest, queryResponse };
}

// ---------------------------------------------------------------------------
// Level 2 — Cited
// ---------------------------------------------------------------------------

function checkLevel2(queryResponse) {
  const checks = [];
  if (!queryResponse) {
    checks.push(check('response_has_confidence', false, 'No query response'));
    checks.push(check('confidence_has_completeness', false));
    checks.push(check('response_has_citations', false));
    checks.push(check('citations_has_statement', false));
    return checks;
  }

  // confidence object
  const conf = queryResponse.confidence;
  checks.push(check('response_has_confidence', conf && typeof conf === 'object'));

  if (conf && typeof conf === 'object') {
    const c = conf.completeness;
    checks.push(check('confidence_has_completeness',
      typeof c === 'number' && c >= 0 && c <= 1, `value: ${c}`));
  } else {
    checks.push(check('confidence_has_completeness', false));
  }

  // citations object
  const cit = queryResponse.citations;
  checks.push(check('response_has_citations', cit && typeof cit === 'object'));

  if (cit && typeof cit === 'object') {
    checks.push(check('citations_has_statement', typeof cit.statement === 'string'));
  } else {
    checks.push(check('citations_has_statement', false));
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Level 3 — Verified
// ---------------------------------------------------------------------------

function checkLevel3(manifest, queryResponse) {
  const checks = [];

  // provider.publicKey in manifest
  const pk = manifest && manifest.provider && manifest.provider.publicKey;
  checks.push(check('manifest_has_public_key', !!pk));

  if (!queryResponse) {
    checks.push(check('response_has_proof', false, 'No query response'));
    checks.push(check('proof_has_type', false));
    checks.push(check('proof_has_cryptosuite', false));
    checks.push(check('proof_has_proof_value', false));
    checks.push(check('signature_valid', false));
    return checks;
  }

  const proof = queryResponse.proof;
  checks.push(check('response_has_proof', proof && typeof proof === 'object'));

  if (proof && typeof proof === 'object') {
    checks.push(check('proof_has_type', typeof proof.type === 'string'));
    checks.push(check('proof_has_cryptosuite', typeof proof.cryptosuite === 'string'));
    checks.push(check('proof_has_proof_value', typeof proof.proofValue === 'string'));

    // Attempt signature verification
    if (pk && proof.proofValue && proof.cryptosuite) {
      try {
        // Build the payload to verify: response minus the proof field
        const payload = Object.assign({}, queryResponse);
        delete payload.proof;
        const canonical = JSON.stringify(payload);

        const algorithm = proof.cryptosuite === 'eddsa-2022' ? 'ed25519' : 'RSA-SHA256';

        if (algorithm === 'ed25519') {
          // Ed25519 verify
          const keyObj = crypto.createPublicKey({
            key: Buffer.from(pk, 'base64'),
            format: 'der',
            type: 'spki'
          });
          const sig = Buffer.from(proof.proofValue, 'base64');
          const valid = crypto.verify(null, Buffer.from(canonical), keyObj, sig);
          checks.push(check('signature_valid', valid));
        } else {
          // RSA fallback
          const verifier = crypto.createVerify('RSA-SHA256');
          verifier.update(canonical);
          const valid = verifier.verify(pk, proof.proofValue, 'base64');
          checks.push(check('signature_valid', valid));
        }
      } catch (e) {
        checks.push(check('signature_valid', false, e.message));
      }
    } else {
      checks.push(check('signature_valid', false, 'Missing public key or proof value'));
    }
  } else {
    checks.push(check('proof_has_type', false));
    checks.push(check('proof_has_cryptosuite', false));
    checks.push(check('proof_has_proof_value', false));
    checks.push(check('signature_valid', false));
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function validateProvider(url) {
  const allChecks = [];

  // Level 1
  const { checks: l1, manifest, queryResponse } = await checkLevel1(url);
  allChecks.push(...l1);

  const level1Pass = l1.every(c => c.passed);

  // Level 2
  let level2Pass = false;
  if (level1Pass) {
    const l2 = checkLevel2(queryResponse);
    allChecks.push(...l2);
    level2Pass = l2.every(c => c.passed);
  }

  // Level 3
  let level3Pass = false;
  if (level2Pass) {
    const l3 = checkLevel3(manifest, queryResponse);
    allChecks.push(...l3);
    level3Pass = l3.every(c => c.passed);
  }

  let level = 'No level achieved';
  if (level1Pass) level = 'Level 1 (Basic)';
  if (level2Pass) level = 'Level 2 (Cited)';
  if (level3Pass) level = 'Level 3 (Verified)';

  const passed = allChecks.filter(c => c.passed).length;
  const failed = allChecks.filter(c => !c.passed).length;

  return {
    url,
    level,
    checks: allChecks,
    passed,
    failed,
    timestamp: new Date().toISOString()
  };
}

module.exports = { validateProvider };
