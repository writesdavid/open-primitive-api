const fetch = require('node-fetch');

const USER_AGENT = 'OpenPrimitive/1.0 (davehamiltonj@gmail.com)';
const BASE = 'https://www.federalregister.gov/api/v1';

function makeController() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function envelope(query, results) {
  return {
    domain: 'federal-register',
    source: 'Federal Register',
    source_url: 'https://www.federalregister.gov',
    freshness: new Date().toISOString(),
    query,
    results
  };
}

async function searchRules({ query, agency, type, dateAfter } = {}) {
  const params = new URLSearchParams();
  if (query) params.set('conditions[term]', query);
  if (agency) params.set('conditions[agencies][]', agency);
  if (type) params.set('conditions[type][]', type);
  if (dateAfter) params.set('conditions[publication_date][gte]', dateAfter);
  params.set('per_page', '20');
  params.set('order', 'newest');

  const { signal, clear } = makeController();
  try {
    const res = await fetch(`${BASE}/documents.json?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal
    });
    clear();
    if (!res.ok) return envelope({ query, agency, type, dateAfter }, []);
    const data = await res.json();
    const results = (data.results || []).map(d => ({
      document_number: d.document_number,
      title: d.title,
      type: d.type,
      abstract: d.abstract,
      publication_date: d.publication_date,
      agencies: (d.agencies || []).map(a => a.name),
      html_url: d.html_url,
      pdf_url: d.pdf_url
    }));
    return envelope({ query, agency, type, dateAfter }, results);
  } catch (e) {
    clear();
    return envelope({ query, agency, type, dateAfter }, []);
  }
}

async function getDocument(documentNumber) {
  const { signal, clear } = makeController();
  try {
    const res = await fetch(`${BASE}/documents/${documentNumber}.json`, {
      headers: { 'User-Agent': USER_AGENT },
      signal
    });
    clear();
    if (!res.ok) return envelope({ documentNumber }, null);
    const data = await res.json();
    return envelope({ documentNumber }, {
      document_number: data.document_number,
      title: data.title,
      type: data.type,
      abstract: data.abstract,
      body_html_url: data.body_html_url,
      publication_date: data.publication_date,
      agencies: (data.agencies || []).map(a => a.name),
      html_url: data.html_url,
      pdf_url: data.pdf_url,
      full_text_xml_url: data.full_text_xml_url
    });
  } catch (e) {
    clear();
    return envelope({ documentNumber }, null);
  }
}

async function getAgencyRules(agencySlug) {
  const params = new URLSearchParams();
  params.set('conditions[agencies][]', agencySlug);
  params.set('conditions[type][]', 'rule');
  params.set('per_page', '20');
  params.set('order', 'newest');

  const { signal, clear } = makeController();
  try {
    const res = await fetch(`${BASE}/documents.json?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal
    });
    clear();
    if (!res.ok) return envelope({ agencySlug }, []);
    const data = await res.json();
    const results = (data.results || []).map(d => ({
      document_number: d.document_number,
      title: d.title,
      type: d.type,
      abstract: d.abstract,
      publication_date: d.publication_date,
      html_url: d.html_url
    }));
    return envelope({ agencySlug }, results);
  } catch (e) {
    clear();
    return envelope({ agencySlug }, []);
  }
}

async function getTodaysDocuments() {
  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams();
  params.set('conditions[publication_date][is]', today);
  params.set('per_page', '50');

  const { signal, clear } = makeController();
  try {
    const res = await fetch(`${BASE}/documents.json?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal
    });
    clear();
    if (!res.ok) return envelope({ date: today }, []);
    const data = await res.json();
    const results = (data.results || []).map(d => ({
      document_number: d.document_number,
      title: d.title,
      type: d.type,
      agencies: (d.agencies || []).map(a => a.name),
      publication_date: d.publication_date,
      html_url: d.html_url
    }));
    return envelope({ date: today }, results);
  } catch (e) {
    clear();
    return envelope({ date: today }, []);
  }
}

module.exports = { searchRules, getDocument, getAgencyRules, getTodaysDocuments };
