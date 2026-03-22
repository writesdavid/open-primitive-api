const fetch = require('node-fetch');

const BASE = 'https://dailymed.nlm.nih.gov/dailymed/services/v2';

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

async function searchLabels(drugName) {
  if (!drugName) return { error: 'Drug name required. Use ?name=aspirin' };

  const url = `${BASE}/spls.json?drug_name=${encodeURIComponent(drugName)}&page=1&pagesize=5`;
  const data = await fetchWithTimeout(url);

  if (!data || !data.data) {
    return { error: `No labels found for "${drugName}"` };
  }

  const labels = data.data.map((spl) => ({
    setId: spl.setid,
    title: spl.title,
    labeler: spl.labeler,
    activeIngredients: spl.active_ingredients || [],
    effectiveDate: spl.effective_time || null,
    publishDate: spl.published_date || null,
  }));

  return {
    domain: 'drug-labels',
    source: 'NLM DailyMed',
    source_url: 'https://dailymed.nlm.nih.gov',
    freshness: new Date().toISOString(),
    drug: drugName,
    labels,
    count: labels.length,
  };
}

function extractSection(components, title) {
  if (!components || !Array.isArray(components)) return null;
  for (const comp of components) {
    if (comp.title && comp.title.toLowerCase().includes(title.toLowerCase())) {
      // Strip HTML tags from the text
      const text = (comp.text || '').replace(/<[^>]+>/g, '').trim();
      if (text) return text;
    }
    // Recurse into nested components
    if (comp.component && Array.isArray(comp.component)) {
      const found = extractSection(comp.component, title);
      if (found) return found;
    }
  }
  return null;
}

async function getLabelSections(setId) {
  if (!setId) return { error: 'Set ID required. Use ?id={setId}' };

  const url = `${BASE}/spls/${encodeURIComponent(setId)}.json`;
  const data = await fetchWithTimeout(url);

  if (!data) {
    return { error: `Label not found for set ID "${setId}"` };
  }

  const components = data.component || data.components || [];
  // DailyMed nests sections inside structured_product_labeling > component
  const sections = data.structuredProductLabeling
    ? (data.structuredProductLabeling.component || [])
    : components;

  // Try multiple paths to find section text
  const allSections = sections.length > 0 ? sections : (data.data ? [data.data] : [data]);

  return {
    domain: 'drug-labels',
    source: 'NLM DailyMed',
    source_url: 'https://dailymed.nlm.nih.gov',
    freshness: new Date().toISOString(),
    setId,
    sections: {
      warnings: extractSection(allSections, 'warnings') || extractSection(allSections, 'WARNINGS'),
      interactions: extractSection(allSections, 'drug interactions') || extractSection(allSections, 'DRUG INTERACTIONS'),
      adverseReactions: extractSection(allSections, 'adverse reactions') || extractSection(allSections, 'ADVERSE REACTIONS'),
      contraindications: extractSection(allSections, 'contraindications') || extractSection(allSections, 'CONTRAINDICATIONS'),
    },
    publishDate: data.published_date || data.effective_time || null,
  };
}

module.exports = { searchLabels, getLabelSections };
