const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const TIMEOUT_MS = 10000;

async function checkDomain(domain) {
  const url = `https://${domain}/.well-known/opp.json`;
  const result = { domain, url, found: false, valid: false, manifest: null, error: null };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json', 'User-Agent': 'opp-crawler/1.0' }
    });
    clearTimeout(timeout);

    if (res.status !== 200) {
      result.error = `HTTP ${res.status}`;
      return result;
    }

    const text = await res.text();
    let manifest;
    try {
      manifest = JSON.parse(text);
    } catch (e) {
      result.error = 'Invalid JSON';
      return result;
    }

    result.found = true;

    // Minimal validation: must have name and at least one endpoint or version
    if (manifest.name || manifest.provider || manifest.endpoints) {
      result.valid = true;
      result.manifest = manifest;
    } else {
      result.error = 'JSON found but missing required fields (name, provider, or endpoints)';
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      result.error = 'Timeout';
    } else {
      result.error = err.message;
    }
  }

  return result;
}

async function crawl(domains) {
  const results = await Promise.all(domains.map(checkDomain));

  const report = {
    crawled_at: new Date().toISOString(),
    total: results.length,
    found: results.filter(r => r.found).length,
    valid: results.filter(r => r.valid).length,
    results
  };

  return report;
}

async function main() {
  // Load domains from file arg or default seed list
  const seedPath = process.argv[2] || path.join(__dirname, 'seed-domains.json');
  let domains;

  try {
    domains = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  } catch (err) {
    console.error(`Failed to read seed list at ${seedPath}: ${err.message}`);
    process.exit(1);
  }

  console.error(`Crawling ${domains.length} domains...`);
  const report = await crawl(domains);

  // Print JSON report to stdout
  console.log(JSON.stringify(report, null, 2));

  // Summary to stderr
  console.error(`\nDone. ${report.found}/${report.total} found, ${report.valid} valid.`);

  // Write registry entries for valid manifests
  const registryDir = path.join(__dirname, '..', 'registry');
  if (report.valid > 0 && fs.existsSync(registryDir)) {
    for (const r of report.results.filter(r => r.valid)) {
      const filename = r.domain.replace(/\./g, '_') + '.json';
      const entry = {
        domain: r.domain,
        manifest_url: r.url,
        registered_at: report.crawled_at,
        manifest: r.manifest
      };
      fs.writeFileSync(path.join(registryDir, filename), JSON.stringify(entry, null, 2) + '\n');
      console.error(`Registered: ${r.domain} -> registry/${filename}`);
    }
  }
}

main();
