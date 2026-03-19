const fetch = require('node-fetch');

const USER_AGENT = 'OpenPrimitive/1.0 (davehamiltonj@gmail.com)';
const SEARCH_BASE = 'https://efts.sec.gov/LATEST';
const DATA_BASE = 'https://data.sec.gov';

function fetchWithTimeout(url, opts = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...opts, signal: controller.signal })
    .then(res => { clearTimeout(id); return res; })
    .catch(err => { clearTimeout(id); throw err; });
}

function headers() {
  return { 'User-Agent': USER_AGENT, 'Accept': 'application/json' };
}

function padCik(cik) {
  return String(cik).padStart(10, '0');
}

async function searchCompany(query) {
  const url = `${SEARCH_BASE}/search-index?q=${encodeURIComponent(query)}&dateRange=custom&startdt=2024-01-01&forms=10-K,10-Q,8-K&from=0&size=10`;
  const res = await fetchWithTimeout(url, { headers: headers() });
  if (!res.ok) throw new Error(`SEC search failed: ${res.status}`);
  const data = await res.json();

  const companiesMap = {};
  const hits = (data.hits && data.hits.hits) || [];

  for (const hit of hits) {
    const src = hit._source || {};
    const name = src.entity_name || src.display_names?.[0] || 'Unknown';
    const cik = src.file_num ? src.file_num.replace(/^0*/, '') : (src.ciks?.[0] || '');
    const ticker = src.tickers?.[0] || null;
    const key = cik || name;

    if (!companiesMap[key]) {
      companiesMap[key] = { name, cik, ticker, filings: [] };
    }

    companiesMap[key].filings.push({
      form: src.form_type || src.file_type || '',
      date: src.file_date || src.period_of_report || '',
      url: src.file_num ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=&dateb=&owner=include&count=40` : ''
    });
  }

  return {
    domain: 'sec',
    source: 'SEC EDGAR',
    source_url: 'https://www.sec.gov',
    freshness: new Date().toISOString(),
    query,
    companies: Object.values(companiesMap)
  };
}

const FACT_MAP = {
  revenue: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss'],
  totalAssets: ['Assets'],
  totalLiabilities: ['Liabilities', 'LiabilitiesAndStockholdersEquity'],
  eps: ['EarningsPerShareBasic', 'EarningsPerShareDiluted']
};

function extractFacts(usGaap) {
  const result = {};

  for (const [key, candidates] of Object.entries(FACT_MAP)) {
    result[key] = [];
    for (const concept of candidates) {
      const entry = usGaap[concept];
      if (!entry || !entry.units) continue;
      const units = entry.units['USD'] || entry.units['USD/shares'] || Object.values(entry.units)[0];
      if (!units) continue;

      const annuals = units.filter(u => u.form === '10-K' && u.fy);
      const seen = new Set();
      for (const a of annuals) {
        if (seen.has(a.fy)) continue;
        seen.add(a.fy);
        result[key].push({ year: a.fy, value: a.val });
      }

      if (result[key].length > 0) {
        result[key].sort((a, b) => b.year - a.year);
        break;
      }
    }
  }

  return result;
}

async function getCompanyFacts(cik) {
  const padded = padCik(cik);
  const url = `${DATA_BASE}/api/xbrl/companyfacts/CIK${padded}.json`;
  const res = await fetchWithTimeout(url, { headers: headers() });
  if (!res.ok) throw new Error(`SEC company facts failed: ${res.status}`);
  const data = await res.json();

  const usGaap = (data.facts && data.facts['us-gaap']) || {};
  const facts = extractFacts(usGaap);

  return {
    domain: 'sec',
    source: 'SEC EDGAR',
    source_url: 'https://www.sec.gov',
    freshness: new Date().toISOString(),
    cik: String(cik),
    name: data.entityName || '',
    facts
  };
}

module.exports = { searchCompany, getCompanyFacts };
