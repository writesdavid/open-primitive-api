const fetch = require('node-fetch');

const FDA_BASE = 'https://api.fda.gov/food/enforcement.json';

async function fetchWithTimeout(url, ms = 10000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    if (!res.ok && res.status !== 404) return null;
    if (res.status === 404) return { meta: { results: { total: 0 } }, results: [] };
    return await res.json();
  } catch {
    clearTimeout(id);
    return null;
  }
}

async function getRecent() {
  const now = new Date();
  const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '');
  const url = `${FDA_BASE}?search=status:"Ongoing"+AND+report_date:[${fmt(start)}+TO+${fmt(now)}]&sort=report_date:desc&limit=20`;
  const data = await fetchWithTimeout(url);
  if (!data) return { error: 'FDA API unavailable' };
  return {
    domain: 'food',
    source: 'FDA Enforcement',
    source_url: 'https://api.fda.gov',
    freshness: new Date().toISOString(),
    total: data.meta ? data.meta.results.total : 0,
    recalls: (data.results || []).map(r => ({
      product: r.product_description,
      firm: r.recalling_firm,
      classification: r.classification,
      status: r.status,
      reason: r.reason_for_recall,
      distribution: r.distribution_pattern,
      date: r.recall_initiation_date,
      quantity: r.product_quantity,
      recallNumber: r.recall_number,
    })),
  };
}

async function search(query) {
  if (!query) return { error: 'query is required' };
  const encoded = encodeURIComponent(query);
  const url = `${FDA_BASE}?search=product_description:"${encoded}"+OR+recalling_firm:"${encoded}"&sort=report_date:desc&limit=20`;
  const data = await fetchWithTimeout(url);
  if (!data) return { error: 'FDA API unavailable' };
  return {
    domain: 'food',
    source: 'FDA Enforcement',
    source_url: 'https://api.fda.gov',
    freshness: new Date().toISOString(),
    query,
    total: data.meta ? data.meta.results.total : 0,
    recalls: (data.results || []).map(r => ({
      product: r.product_description,
      firm: r.recalling_firm,
      classification: r.classification,
      status: r.status,
      reason: r.reason_for_recall,
      distribution: r.distribution_pattern,
      date: r.recall_initiation_date,
      quantity: r.product_quantity,
      recallNumber: r.recall_number,
    })),
  };
}

module.exports = { getRecent, search };
