const fetch = require('node-fetch');

// FSIS Recall API — meat, poultry, egg product recalls
// Docs: https://www.fsis.usda.gov/science-data/developer-resources/recall-api
const FSIS_RECALL_BASE = 'https://www.fsis.usda.gov/fsis/api/recall';

// FSIS MPI Directory API — federally inspected establishments
// Docs: https://www.fsis.usda.gov/science-data/developer-resources/mpi-api
const FSIS_MPI_BASE = 'https://www.fsis.usda.gov/fsis/api/mpi';

// CDC Food Safety RSS (combines FSIS + FDA recalls) — fallback
const CDC_RSS = 'https://www2c.cdc.gov/podcasts/createrss.asp?c=146';

async function fetchWithTimeout(url, ms = 12000, headers = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'OpenPrimitive/1.0 (federal-data-api; api.openprimitive.com)',
        'Accept': 'application/json',
        ...headers,
      },
    });
    clearTimeout(id);
    if (!res.ok && res.status !== 404) return null;
    if (res.status === 404) return { empty: true };
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('json')) return await res.json();
    return await res.text();
  } catch {
    clearTimeout(id);
    return null;
  }
}

// Parse CDC RSS XML into recall items (fallback when FSIS API is blocked)
function parseRecallRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const desc = (block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '';
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    const guid = (block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';

    // Filter for FSIS recalls (USDA/FSIS in title or link contains fsis)
    const isFSIS = /fsis|usda.*recall|meat|poultry|egg.*product/i.test(title + desc + guid);

    items.push({
      title: title.trim(),
      description: desc.trim().substring(0, 500),
      url: (guid || link).trim(),
      date: pubDate.trim(),
      source: isFSIS ? 'FSIS' : 'FDA',
    });
  }
  return items;
}

// Get recent FSIS recalls
async function getRecent() {
  // Try FSIS recall API first
  const url = `${FSIS_RECALL_BASE}/v/1`;
  const data = await fetchWithTimeout(url);

  // If FSIS API returned JSON data
  if (data && !data.empty && typeof data === 'object' && !data.error) {
    const recalls = Array.isArray(data) ? data : (data.results || data.recalls || []);
    return {
      domain: 'meat',
      source: 'FSIS Recall API',
      source_url: 'https://www.fsis.usda.gov/recalls',
      freshness: new Date().toISOString(),
      total: recalls.length,
      recalls: recalls.slice(0, 25).map(formatFSISRecall),
      citation: 'USDA Food Safety and Inspection Service. Public data, no login required.',
      hint: 'Search by product or firm: /v1/meat?q=chicken. Get establishment info: /v1/meat?est=12345',
    };
  }

  // Fallback: CDC RSS feed (aggregates FSIS + FDA recalls)
  const rss = await fetchWithTimeout(CDC_RSS, 15000, { Accept: 'application/xml' });
  if (rss && typeof rss === 'string' && rss.includes('<item>')) {
    const allItems = parseRecallRSS(rss);
    const fsisItems = allItems.filter(i => i.source === 'FSIS');
    const items = fsisItems.length > 0 ? fsisItems : allItems;
    return {
      domain: 'meat',
      source: 'CDC Food Safety RSS (FSIS + FDA)',
      source_url: 'https://www.fsis.usda.gov/recalls',
      freshness: new Date().toISOString(),
      total: items.length,
      recalls: items.slice(0, 25),
      note: 'FSIS API unavailable. Data sourced from CDC aggregate feed.',
      citation: 'USDA FSIS via CDC Food Safety RSS. Public data, no login required.',
      hint: 'Search by product: /v1/meat?q=chicken. FSIS recall API may be temporarily unavailable.',
    };
  }

  return {
    domain: 'meat',
    error: 'FSIS API and CDC fallback both unavailable. Try again later.',
    hint: 'FSIS uses Akamai CDN which occasionally blocks API requests. The data remains at https://www.fsis.usda.gov/recalls',
    freshness: new Date().toISOString(),
  };
}

// Search FSIS recalls by keyword
async function search(query) {
  if (!query) return { error: 'q parameter is required. Example: /v1/meat?q=chicken' };

  const encoded = encodeURIComponent(query);

  // Try FSIS recall search API
  const url = `${FSIS_RECALL_BASE}/mpi/search?query=${encoded}&start=0&end=25`;
  const data = await fetchWithTimeout(url);

  if (data && !data.empty && typeof data === 'object' && !data.error) {
    const recalls = Array.isArray(data) ? data : (data.results || data.recalls || []);
    return {
      domain: 'meat',
      source: 'FSIS Recall API',
      source_url: 'https://www.fsis.usda.gov/recalls',
      freshness: new Date().toISOString(),
      query,
      total: recalls.length,
      recalls: recalls.slice(0, 25).map(formatFSISRecall),
      citation: 'USDA Food Safety and Inspection Service. Public data, no login required.',
      hint: 'Get recent recalls: /v1/meat (no params). Get establishment: /v1/meat?est=12345',
    };
  }

  // Fallback: CDC RSS filtered by query
  const rss = await fetchWithTimeout(CDC_RSS, 15000, { Accept: 'application/xml' });
  if (rss && typeof rss === 'string' && rss.includes('<item>')) {
    const allItems = parseRecallRSS(rss);
    const lower = query.toLowerCase();
    const matched = allItems.filter(i =>
      i.title.toLowerCase().includes(lower) ||
      i.description.toLowerCase().includes(lower)
    );
    return {
      domain: 'meat',
      source: 'CDC Food Safety RSS (FSIS + FDA)',
      source_url: 'https://www.fsis.usda.gov/recalls',
      freshness: new Date().toISOString(),
      query,
      total: matched.length,
      recalls: matched.slice(0, 25),
      note: 'FSIS API unavailable. Results filtered from CDC aggregate feed.',
      citation: 'USDA FSIS via CDC Food Safety RSS. Public data, no login required.',
    };
  }

  return {
    domain: 'meat',
    error: 'FSIS API and CDC fallback both unavailable. Try again later.',
    query,
    freshness: new Date().toISOString(),
  };
}

// Get FSIS establishment (MPI directory) info
async function getEstablishment(estNumber) {
  if (!estNumber) return { error: 'est parameter is required. Example: /v1/meat?est=12345' };

  const url = `${FSIS_MPI_BASE}/establishments/${encodeURIComponent(estNumber)}`;
  const data = await fetchWithTimeout(url);

  if (!data || data.empty) {
    return {
      domain: 'meat',
      error: `Establishment ${estNumber} not found or FSIS MPI API unavailable.`,
      hint: 'FSIS MPI directory: https://www.fsis.usda.gov/inspection/establishments/meat-poultry-and-egg-product-inspection-directory',
      freshness: new Date().toISOString(),
    };
  }

  if (typeof data === 'object') {
    return {
      domain: 'meat',
      source: 'FSIS MPI Directory',
      source_url: 'https://www.fsis.usda.gov/inspection/establishments/meat-poultry-and-egg-product-inspection-directory',
      freshness: new Date().toISOString(),
      establishment: estNumber,
      data: data,
      citation: 'USDA FSIS Meat, Poultry, and Egg Product Inspection Directory. Public data, no login required.',
      hint: 'Search recalls: /v1/meat?q=chicken. Recent recalls: /v1/meat',
    };
  }

  return {
    domain: 'meat',
    error: 'FSIS MPI API returned unexpected format.',
    freshness: new Date().toISOString(),
  };
}

// Format FSIS recall API response into consistent shape
function formatFSISRecall(r) {
  if (!r || typeof r !== 'object') return r;
  return {
    recallNumber: r.recall_number || r.recallNumber || r.RECALL_NUMBER || null,
    date: r.recall_date || r.date || r.RECALL_DATE || null,
    product: r.product || r.product_description || r.PRODUCT || null,
    firm: r.firm || r.establishment || r.company || r.FIRM || null,
    reason: r.reason || r.reason_for_recall || r.REASON || null,
    classification: r.classification || r.recall_class || r.CLASS || null,
    pounds: r.pounds_recalled || r.quantity || r.POUNDS_RECALLED || null,
    status: r.status || r.STATUS || null,
    type: r.product_type || r.TYPE || null,
  };
}

module.exports = { getRecent, search, getEstablishment };
