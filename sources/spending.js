const fetch = require('node-fetch');

const USA_SPENDING_BASE = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';

async function fetchWithTimeout(url, body, ms = 10000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(id);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(id);
    return null;
  }
}

async function searchSpending(query) {
  if (!query) return { error: 'query parameter is required' };
  const body = {
    filters: {
      keywords: [query],
      time_period: [{
        start_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        end_date: new Date().toISOString().slice(0, 10),
      }],
    },
    fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'Description'],
    page: 1,
    limit: 10,
    sort: 'Award Amount',
    order: 'desc',
  };
  const data = await fetchWithTimeout(USA_SPENDING_BASE, body);
  if (!data) return { error: 'USAspending.gov API unavailable' };
  const results = data.results || [];
  return {
    domain: 'spending',
    source: 'USAspending.gov',
    source_url: 'https://usaspending.gov',
    freshness: new Date().toISOString(),
    query,
    awards: results.map(r => ({
      awardId: r['Award ID'] || null,
      recipient: r['Recipient Name'] || null,
      amount: r['Award Amount'] || null,
      agency: r['Awarding Agency'] || null,
      description: r['Description'] || null,
    })),
    count: results.length,
  };
}

module.exports = { searchSpending };
