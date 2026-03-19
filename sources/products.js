const fetch = require('node-fetch');

const BASE = 'https://www.saferproducts.gov/RestWebServices/Recall';

function fetchWithTimeout(url, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

function formatRecall(r) {
  return {
    recallId: r.RecallID || r.RecallNumber || null,
    title: r.RecallTitle || '',
    description: r.Description || '',
    products: (r.Products || []).map(p => ({ name: p.Name || '', type: p.Type || '' })),
    hazards: (r.Hazards || []).map(h => h.Name || h.HazardType || '').filter(Boolean),
    remedies: (r.Remedies || []).map(r => r.Name || '').filter(Boolean),
    manufacturers: (r.Manufacturers || []).map(m => m.Name || '').filter(Boolean),
    recallDate: r.RecallDate || '',
    url: r.URL || ''
  };
}

async function getRecent() {
  const now = new Date();
  const past = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const dateStr = past.toISOString().split('T')[0];
  const url = `${BASE}?format=json&RecallDateStart=${dateStr}`;

  const res = await fetchWithTimeout(url);
  const data = await res.json();
  const recalls = (Array.isArray(data) ? data : []).slice(0, 20).map(formatRecall);

  return {
    domain: 'products',
    source: 'CPSC',
    source_url: url,
    freshness: new Date().toISOString(),
    total: recalls.length,
    recalls
  };
}

async function search(query) {
  const url = `${BASE}?format=json&ProductName=${encodeURIComponent(query)}`;

  const res = await fetchWithTimeout(url);
  const data = await res.json();
  const recalls = (Array.isArray(data) ? data : []).slice(0, 20).map(formatRecall);

  return {
    domain: 'products',
    source: 'CPSC',
    source_url: url,
    freshness: new Date().toISOString(),
    query,
    total: recalls.length,
    recalls
  };
}

module.exports = { getRecent, search };
