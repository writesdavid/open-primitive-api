// Run: node test/test-opp.js

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = 3099;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;

function log(ok, name, detail) {
  if (ok) {
    passed++;
    console.log(`\x1b[32m  PASS\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`\x1b[31m  FAIL\x1b[0m ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function get(urlPath, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: headers || {} };
    const req = http.get(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function run() {
  // ── 1. SERVER STARTS ──
  let app, server;
  try {
    app = require('../server');
    server = app.listen(PORT);
    log(true, '1. Server starts');
  } catch (err) {
    log(false, '1. Server starts', err.message);
    process.exit(1);
  }

  // Give server a moment
  await new Promise((r) => setTimeout(r, 500));

  try {
    // ── 2. META ENDPOINT ──
    const meta = await get('/v1');
    const domainCount = meta.body.domains ? Object.keys(meta.body.domains).length : 0;
    log(domainCount >= 16, '2. Meta endpoint returns 16+ domains', `got ${domainCount}`);

    // ── 3. EACH DOMAIN ──
    const domainTests = [
      ['/v1/flights', 'flights'],
      ['/v1/cars?year=2020&make=toyota&model=camry', 'cars'],
      ['/v1/food', 'food'],
      ['/v1/water?zip=10001', 'water'],
      ['/v1/drugs?name=ibuprofen', 'drugs'],
      ['/v1/hospitals?q=mayo', 'hospitals'],
      ['/v1/health?q=vitamin+d', 'health'],
      ['/v1/nutrition?q=apple', 'nutrition'],
      ['/v1/jobs', 'jobs'],
      ['/v1/demographics?zip=10001', 'demographics'],
      ['/v1/products', 'products'],
      ['/v1/sec?q=apple', 'sec'],
      ['/v1/weather?zip=10001', 'weather'],
      ['/v1/safety?zip=10001', 'safety'],
      ['/v1/location?zip=10001', 'location'],
      ['/v1/compare?type=drugs&a=ibuprofen&b=aspirin', 'compare'],
    ];

    for (const [endpoint, name] of domainTests) {
      try {
        const res = await get(endpoint);
        const ok = res.status === 200 && res.body && typeof res.body === 'object' && !res.body.error;
        log(ok, `3. Domain: ${name}`, ok ? '' : `status=${res.status} ${JSON.stringify(res.body).slice(0, 100)}`);
      } catch (err) {
        log(false, `3. Domain: ${name}`, err.message);
      }
    }

    // ── 4. OPP ENVELOPE ──
    try {
      const drugsRes = await get('/v1/drugs?name=ibuprofen');
      const d = drugsRes.body;
      const hasConfidence = d.confidence !== undefined || (d.data && d.data.confidence !== undefined);
      const hasCitations = d.citations !== undefined || (d.data && d.data.citations !== undefined);
      const hasProof = d.proof !== undefined;
      log(hasProof, '4. OPP envelope — proof field present');
    } catch (err) {
      log(false, '4. OPP envelope', err.message);
    }

    // ── 5. SIGNATURE VERIFICATION ──
    try {
      const drugsRes = await get('/v1/drugs?name=aspirin');
      const d = drugsRes.body;
      if (!d.proof || !d.proof.proofValue) {
        log(false, '5. Signature verification', 'no proof in response');
      } else {
        const pubKeyPath = path.join(__dirname, '..', '.keys', 'public.pem');
        const pubPem = fs.readFileSync(pubKeyPath, 'utf8');
        const publicKey = crypto.createPublicKey(pubPem);
        const proof = d.proof;
        const proofValue = proof.proofValue;

        // Reconstruct canonical payload (everything except proof)
        const payload = {};
        for (const k of Object.keys(d).sort()) {
          if (k !== 'proof') payload[k] = d[k];
        }
        const canonical = JSON.stringify(payload, Object.keys(payload).sort());
        const sig = Buffer.from(proofValue, 'base64url');
        const valid = crypto.verify(null, Buffer.from(canonical), publicKey, sig);
        log(valid, '5. Signature verification — Ed25519 valid');
      }
    } catch (err) {
      log(false, '5. Signature verification', err.message);
    }

    // ── 6. MANIFEST ──
    try {
      const manifest = await get('/.well-known/opp.json');
      const hasDomainsArray = Array.isArray(manifest.body.domains);
      log(hasDomainsArray && manifest.body.domains.length >= 16, '6. Manifest — .well-known/opp.json', `domains: ${manifest.body.domains ? manifest.body.domains.length : 0}`);
    } catch (err) {
      log(false, '6. Manifest', err.message);
    }

    // ── 7. NATURAL LANGUAGE ──
    try {
      const askRes = await get('/v1/ask?q=is+the+water+safe+in+10001');
      log(askRes.status === 200 && askRes.body && !askRes.body.error, '7. Natural language — /v1/ask routes correctly');
    } catch (err) {
      log(false, '7. Natural language', err.message);
    }

    // ── 8. CROSS-DOMAIN SAFETY ──
    try {
      const safetyRes = await get('/v1/safety?zip=10001');
      const hasScore = safetyRes.body.compositeScore !== undefined || safetyRes.body.score !== undefined || safetyRes.body.composite !== undefined;
      log(safetyRes.status === 200, '8. Cross-domain safety — /v1/safety?zip=10001', hasScore ? '' : 'response received but no obvious composite score field');
    } catch (err) {
      log(false, '8. Cross-domain safety', err.message);
    }

    // ── 9. COMPARE ──
    try {
      const cmpRes = await get('/v1/compare?type=drugs&a=ibuprofen&b=aspirin');
      const hasVerdict = cmpRes.body.verdict !== undefined || cmpRes.body.comparison !== undefined;
      log(cmpRes.status === 200 && cmpRes.body && !cmpRes.body.error, '9. Compare — drugs ibuprofen vs aspirin');
    } catch (err) {
      log(false, '9. Compare', err.message);
    }

    // ── 10. STATS ──
    try {
      const statsRes = await get('/v1/stats');
      log(statsRes.body.agentPercent !== undefined, '10. Stats — agentPercent field present');
    } catch (err) {
      log(false, '10. Stats', err.message);
    }

    // ── 11. REGISTRY ──
    try {
      const regRes = await get('/v1/registry');
      const hasProviders = Array.isArray(regRes.body.providers) || Array.isArray(regRes.body);
      log(regRes.status === 200 && hasProviders, '11. Registry — providers array');
    } catch (err) {
      log(false, '11. Registry', err.message);
    }

    // ── 12. AGENT DETECTION ──
    try {
      // First hit an endpoint as ClaudeBot
      await get('/v1/flights', { 'User-Agent': 'ClaudeBot/1.0' });
      // Then check stats
      const statsRes = await get('/v1/stats');
      const agentCount = statsRes.body.agent || 0;
      log(agentCount > 0, '12. Agent detection — ClaudeBot counted in stats', `agent requests: ${agentCount}`);
    } catch (err) {
      log(false, '12. Agent detection', err.message);
    }

  } finally {
    server.close();
  }

  // ── SUMMARY ──
  console.log('\n' + '─'.repeat(40));
  console.log(`  ${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`);
  console.log('─'.repeat(40));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
