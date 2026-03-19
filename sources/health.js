const fetch = require('node-fetch');

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const USER_AGENT = 'OpenPrimitive/1.0 (contact: davehamiltonj@gmail.com)';

const ODS_SHEETS = {
  'vitamin d': 'VitaminD', 'vitamin c': 'VitaminC', 'vitamin b12': 'VitaminB12',
  'vitamin a': 'VitaminA', 'vitamin b6': 'VitaminB6', 'vitamin e': 'VitaminE',
  'vitamin k': 'VitaminK', 'zinc': 'Zinc', 'iron': 'Iron', 'magnesium': 'Magnesium',
  'calcium': 'Calcium', 'potassium': 'Potassium', 'selenium': 'Selenium',
  'iodine': 'Iodine', 'omega-3': 'Omega3FattyAcids', 'fish oil': 'Omega3FattyAcids',
  'probiotics': 'Probiotics', 'melatonin': 'Melatonin', 'ashwagandha': 'Ashwagandha',
  'turmeric': 'Turmeric', 'curcumin': 'Turmeric', 'creatine': 'Creatine',
  'collagen': 'Collagen', 'coq10': 'CoenzymeQ10', 'ginkgo': 'Ginkgo',
  'ginseng': 'Ginseng', 'echinacea': 'Echinacea', 'garlic': 'Garlic',
  'glucosamine': 'Glucosamine',
};

async function fetchWithTimeout(url, ms = 10000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    clearTimeout(id);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(id);
    return null;
  }
}

function getOdsUrl(query) {
  const q = query.toLowerCase();
  for (const [key, val] of Object.entries(ODS_SHEETS)) {
    if (q.includes(key) || key.includes(q)) {
      return `https://ods.od.nih.gov/factsheets/${val}-HealthProfessional/`;
    }
  }
  return null;
}

function evidenceLevel(count) {
  if (count >= 500) return { level: 'strong', label: 'Strong research signal' };
  if (count >= 50) return { level: 'moderate', label: 'Moderate research signal' };
  if (count >= 10) return { level: 'limited', label: 'Limited research signal' };
  if (count >= 1) return { level: 'weak', label: 'Weak research signal' };
  return { level: 'none', label: 'No studies found' };
}

async function searchHealth(query) {
  if (!query) return { error: 'Search query required' };

  const searchUrl = `${EUTILS_BASE}/esearch.fcgi?db=pubmed&retmode=json&retmax=5&sort=pub_date&term=${encodeURIComponent(query)}[Title/Abstract]`;
  const searchData = await fetchWithTimeout(searchUrl);
  if (!searchData) return { error: 'PubMed unavailable' };

  const result = searchData.esearchresult;
  const count = parseInt(result.count || 0);
  const ids = result.idlist || [];

  let studies = [];
  if (ids.length > 0) {
    const summaryUrl = `${EUTILS_BASE}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`;
    const summaryData = await fetchWithTimeout(summaryUrl);
    if (summaryData && summaryData.result) {
      studies = ids.map(id => {
        const s = summaryData.result[id];
        if (!s) return null;
        return {
          id,
          title: s.title,
          journal: s.fulljournalname || s.source,
          pubDate: s.pubdate,
          authors: s.authors && s.authors.length > 0
            ? (s.authors.length > 1 ? `${s.authors[0].name} et al.` : s.authors[0].name)
            : 'Unknown',
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        };
      }).filter(Boolean);
    }
  }

  const evidence = evidenceLevel(count);
  return {
    domain: 'health',
    source: 'PubMed/MEDLINE',
    source_url: 'https://pubmed.ncbi.nlm.nih.gov',
    freshness: new Date().toISOString(),
    query,
    totalStudies: count,
    evidence: evidence.label,
    evidenceLevel: evidence.level,
    odsUrl: getOdsUrl(query),
    studies,
  };
}

module.exports = { searchHealth };
