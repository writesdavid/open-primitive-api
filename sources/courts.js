const fetch = require('node-fetch');

const USER_AGENT = 'OpenPrimitive/1.0 (davehamiltonj@gmail.com)';
const BASE = 'https://www.courtlistener.com/api/rest/v4';

function makeController() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function envelope(query, results) {
  return {
    domain: 'courts',
    source: 'CourtListener',
    source_url: 'https://www.courtlistener.com',
    freshness: new Date().toISOString(),
    query,
    results
  };
}

async function searchCases({ query, court, dateAfter, dateBefore } = {}) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (court) params.set('court', court);
  if (dateAfter) params.set('date_filed__gte', dateAfter);
  if (dateBefore) params.set('date_filed__lte', dateBefore);
  params.set('format', 'json');

  const { signal, clear } = makeController();
  try {
    const res = await fetch(`${BASE}/search/?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal
    });
    clear();
    if (!res.ok) return envelope({ query, court, dateAfter, dateBefore }, []);
    const data = await res.json();
    return envelope({ query, court, dateAfter, dateBefore }, data.results || []);
  } catch (e) {
    clear();
    return envelope({ query, court, dateAfter, dateBefore }, []);
  }
}

async function getOpinion(id) {
  const { signal, clear } = makeController();
  try {
    const res = await fetch(`${BASE}/opinions/${id}/?format=json`, {
      headers: { 'User-Agent': USER_AGENT },
      signal
    });
    clear();
    if (!res.ok) return envelope({ id }, null);
    const data = await res.json();
    return envelope({ id }, data);
  } catch (e) {
    clear();
    return envelope({ id }, null);
  }
}

async function searchDockets({ query, court } = {}) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (court) params.set('court', court);
  params.set('format', 'json');

  const { signal, clear } = makeController();
  try {
    const res = await fetch(`${BASE}/dockets/?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal
    });
    clear();
    if (!res.ok) return envelope({ query, court }, []);
    const data = await res.json();
    return envelope({ query, court }, data.results || []);
  } catch (e) {
    clear();
    return envelope({ query, court }, []);
  }
}

async function searchParties({ name } = {}) {
  const params = new URLSearchParams();
  if (name) params.set('q', name);
  params.set('type', 'p');
  params.set('format', 'json');

  const { signal, clear } = makeController();
  try {
    const res = await fetch(`${BASE}/search/?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal
    });
    clear();
    if (!res.ok) return envelope({ name }, []);
    const data = await res.json();
    return envelope({ name }, data.results || []);
  } catch (e) {
    clear();
    return envelope({ name }, []);
  }
}

module.exports = { searchCases, getOpinion, searchDockets, searchParties };
