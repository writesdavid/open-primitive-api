#!/usr/bin/env node

const https = require('https');
const http = require('http');
const crypto = require('crypto');

// Colors
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const PASS = green('✓');
const FAIL = red('✗');
const WARN = yellow('⚠');

const url = process.argv[2];

if (!url) {
  console.error('Usage: npx opp-check https://api.example.com');
  process.exit(1);
}

const baseUrl = url.replace(/\/+$/, '');

function fetch(targetUrl) {
  return new Promise((resolve, reject) => {
    const mod = targetUrl.startsWith('https') ? https : http;
    const req = mod.get(targetUrl, { headers: { 'Accept': 'application/json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function isISO8601(s) {
  return typeof s === 'string' && !isNaN(Date.parse(s));
}

async function run() {
  console.log(`\n${bold('OPP Compliance Check:')} ${baseUrl}\n`);

  let level = 0;
  let manifest = null;
  let domainResponse = null;

  // ── Level 1 (Basic) ──

  console.log(bold('Level 1 (Basic)'));

  // Fetch manifest
  try {
    const res = await fetch(`${baseUrl}/.well-known/opp.json`);
    if (res.status !== 200) {
      console.log(`  ${FAIL} Manifest missing at /.well-known/opp.json (HTTP ${res.status})`);
      printResult(level);
      return;
    }
    manifest = JSON.parse(res.body);
    console.log(`  ${PASS} Manifest exists at /.well-known/opp.json`);
  } catch (e) {
    console.log(`  ${FAIL} Manifest unreachable at /.well-known/opp.json (${e.message})`);
    printResult(level);
    return;
  }

  // Check name
  if (manifest.name) {
    console.log(`  ${PASS} Manifest has name: "${manifest.name}"`);
  } else {
    console.log(`  ${FAIL} Manifest missing name field`);
    printResult(level);
    return;
  }

  // Check domains
  const domains = manifest.domains;
  if (Array.isArray(domains) && domains.length > 0) {
    console.log(`  ${PASS} Manifest has ${domains.length} domain${domains.length === 1 ? '' : 's'}`);
  } else {
    console.log(`  ${FAIL} Manifest missing domains array`);
    printResult(level);
    return;
  }

  // Check endpoints exist
  const endpoints = manifest.endpoints;
  if (endpoints && typeof endpoints === 'object') {
    const count = Object.keys(endpoints).length;
    if (count > 0) {
      console.log(`  ${PASS} Manifest has ${count} endpoint${count === 1 ? '' : 's'}`);
    } else {
      console.log(`  ${FAIL} Manifest endpoints object is empty`);
      printResult(level);
      return;
    }
  } else if (Array.isArray(domains) && domains.length > 0 && domains[0].endpoint) {
    // Domains may contain endpoints inline
    console.log(`  ${PASS} Domains contain endpoint definitions`);
  } else {
    console.log(`  ${WARN} Manifest missing endpoints object`);
  }

  // Fetch first domain endpoint
  let firstEndpoint = null;
  if (endpoints && typeof endpoints === 'object') {
    const firstKey = Object.keys(endpoints)[0];
    firstEndpoint = endpoints[firstKey];
    if (typeof firstEndpoint === 'string') {
      firstEndpoint = firstEndpoint.startsWith('http') ? firstEndpoint : `${baseUrl}${firstEndpoint}`;
    } else if (firstEndpoint && firstEndpoint.path) {
      firstEndpoint = `${baseUrl}${firstEndpoint.path}`;
    }
  } else if (Array.isArray(domains) && domains[0] && domains[0].endpoint) {
    const ep = domains[0].endpoint;
    firstEndpoint = ep.startsWith('http') ? ep : `${baseUrl}${ep}`;
  }

  if (firstEndpoint) {
    try {
      const res = await fetch(firstEndpoint);
      if (res.status === 200) {
        domainResponse = JSON.parse(res.body);
      } else {
        console.log(`  ${WARN} First endpoint returned HTTP ${res.status}`);
      }
    } catch (e) {
      console.log(`  ${WARN} First endpoint unreachable (${e.message})`);
    }
  }

  // Check response structure
  if (domainResponse) {
    // domain field
    const data = domainResponse.data || domainResponse;
    if (data.domain || domainResponse.domain) {
      console.log(`  ${PASS} Response has domain field`);
    } else {
      console.log(`  ${WARN} Response missing domain field`);
    }

    // source field
    if (data.source || domainResponse.source) {
      console.log(`  ${PASS} Response has source field`);
    } else {
      console.log(`  ${WARN} Response missing source field`);
    }

    // freshness field
    const freshness = data.freshness || domainResponse.freshness ||
                      data.updated || domainResponse.updated ||
                      data.timestamp || domainResponse.timestamp;
    if (freshness && isISO8601(freshness)) {
      console.log(`  ${PASS} Response has freshness field (ISO 8601)`);
    } else if (freshness) {
      console.log(`  ${WARN} Response has freshness field but not ISO 8601`);
    } else {
      console.log(`  ${WARN} Response missing freshness field`);
    }
  }

  level = 1;

  // ── Level 2 (Cited) ──

  console.log(`\n${bold('Level 2 (Cited)')}`);

  let level2Pass = true;

  if (domainResponse) {
    const data = domainResponse.data || domainResponse;

    // confidence
    const confidence = data.confidence || domainResponse.confidence;
    if (confidence && typeof confidence === 'object') {
      console.log(`  ${PASS} Response has confidence object`);
    } else if (typeof confidence === 'number' || typeof confidence === 'string') {
      console.log(`  ${PASS} Response has confidence value`);
    } else {
      console.log(`  ${FAIL} Response missing confidence`);
      level2Pass = false;
    }

    // citations
    const citations = data.citations || domainResponse.citations;
    if (citations) {
      if (citations.statement || (Array.isArray(citations) && citations.length > 0)) {
        console.log(`  ${PASS} Response has citations${citations.statement ? '.statement' : ''}`);
      } else {
        console.log(`  ${WARN} Response has citations but missing statement`);
        level2Pass = false;
      }
    } else {
      console.log(`  ${FAIL} Response missing citations`);
      level2Pass = false;
    }
  } else {
    console.log(`  ${FAIL} No endpoint response to check`);
    level2Pass = false;
  }

  if (level2Pass) level = 2;

  // ── Level 3 (Verified) ──

  console.log(`\n${bold('Level 3 (Verified)')}`);

  let level3Pass = true;

  // publicKey in manifest
  const publicKey = manifest.publicKey || manifest.public_key;
  if (publicKey) {
    console.log(`  ${PASS} Manifest has publicKey`);
  } else {
    console.log(`  ${FAIL} Manifest missing publicKey`);
    level3Pass = false;
  }

  if (domainResponse) {
    const data = domainResponse.data || domainResponse;
    const proof = data.proof || domainResponse.proof;

    if (proof && typeof proof === 'object') {
      console.log(`  ${PASS} Response has proof object`);

      // Verify signature
      if (publicKey && proof.signature && proof.payload) {
        try {
          const verify = crypto.createVerify('SHA256');
          verify.update(typeof proof.payload === 'string' ? proof.payload : JSON.stringify(proof.payload));
          const valid = verify.verify(publicKey, proof.signature, 'base64');
          if (valid) {
            console.log(`  ${PASS} Signature verifies against public key`);
          } else {
            console.log(`  ${FAIL} Signature does not verify`);
            level3Pass = false;
          }
        } catch (e) {
          console.log(`  ${WARN} Signature verification error: ${e.message}`);
          level3Pass = false;
        }
      } else if (publicKey && proof.signature) {
        // Try verifying signature against response body minus proof
        console.log(`  ${WARN} Proof has signature but no payload field — cannot verify automatically`);
        level3Pass = false;
      } else {
        console.log(`  ${FAIL} Proof missing signature`);
        level3Pass = false;
      }
    } else {
      console.log(`  ${FAIL} Response missing proof object`);
      level3Pass = false;
    }
  } else {
    console.log(`  ${FAIL} No endpoint response to check`);
    level3Pass = false;
  }

  if (level3Pass && level === 2) level = 3;

  printResult(level);
}

function printResult(level) {
  const labels = {
    0: red('Non-conformant ✗'),
    1: green('Level 1 (Basic) ✓'),
    2: green('Level 2 (Cited) ✓'),
    3: green('Level 3 (Verified) ✓'),
  };

  console.log(`\n${bold('Result:')} ${labels[level]}\n`);
  process.exit(level >= 1 ? 0 : 1);
}

run().catch((e) => {
  console.error(red(`Error: ${e.message}`));
  process.exit(1);
});
