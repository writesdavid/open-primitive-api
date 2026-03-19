const fetch = require('node-fetch');

const FDA_BASE = 'https://api.fda.gov';

async function fetchWithTimeout(url, ms = 10000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(id);
    return null;
  }
}

async function getEventCount(searchParam) {
  const url = `${FDA_BASE}/drug/event.json?search=${searchParam}&limit=1`;
  const data = await fetchWithTimeout(url);
  return data && data.meta ? data.meta.results.total : 0;
}

async function getDrug(name) {
  if (!name) return { error: 'Drug name required' };

  const brandParam = `patient.drug.medicinalproduct:"${encodeURIComponent(name)}"`;
  const genericParam = `patient.drug.openfda.generic_name:"${encodeURIComponent(name)}"`;

  const [brandCount, genericCount] = await Promise.all([
    getEventCount(brandParam),
    getEventCount(genericParam),
  ]);

  if (brandCount === 0 && genericCount === 0) return { error: 'No adverse event reports found for this drug' };

  const searchParam = brandCount >= genericCount ? brandParam : genericParam;
  const year = new Date().getFullYear();
  const prevYear = year - 1;

  const [serious, deaths, recent, reactions, label] = await Promise.all([
    fetchWithTimeout(`${FDA_BASE}/drug/event.json?search=${searchParam}+AND+serious:1&limit=1`),
    fetchWithTimeout(`${FDA_BASE}/drug/event.json?search=${searchParam}+AND+seriousnessdeath:1&limit=1`),
    fetchWithTimeout(`${FDA_BASE}/drug/event.json?search=${searchParam}+AND+receivedate:[${prevYear}0101+TO+${year}1231]&limit=1`),
    fetchWithTimeout(`${FDA_BASE}/drug/event.json?search=${searchParam}&count=patient.reaction.reactionmeddrapt.exact&limit=10`),
    fetchWithTimeout(`${FDA_BASE}/drug/label.json?search=openfda.brand_name:"${encodeURIComponent(name)}"+OR+openfda.generic_name:"${encodeURIComponent(name)}"&limit=1`),
  ]);

  const total = Math.max(brandCount, genericCount);
  const labelResult = label && label.results && label.results[0] ? label.results[0] : null;

  return {
    domain: 'drugs',
    source: 'FDA FAERS + Drug Labels',
    source_url: 'https://api.fda.gov',
    freshness: new Date().toISOString(),
    drug: name,
    totalEvents: total,
    seriousEvents: serious && serious.meta ? serious.meta.results.total : 0,
    deathEvents: deaths && deaths.meta ? deaths.meta.results.total : 0,
    recentEvents: recent && recent.meta ? recent.meta.results.total : 0,
    topReactions: reactions && reactions.results ? reactions.results.map(r => ({
      reaction: r.term,
      count: r.count,
    })) : [],
    labelWarnings: labelResult ? {
      warnings: (labelResult.warnings || ['']).join(' ').slice(0, 1500) || null,
      adverseReactions: (labelResult.adverse_reactions || ['']).join(' ').slice(0, 1000) || null,
    } : null,
  };
}

module.exports = { getDrug };
