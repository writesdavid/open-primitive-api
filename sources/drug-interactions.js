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

async function getDrugLabel(drugName) {
  const encoded = encodeURIComponent(drugName);
  const url = `${FDA_BASE}/drug/label.json?search=openfda.generic_name:"${encoded}"+OR+openfda.brand_name:"${encoded}"&limit=1`;
  const data = await fetchWithTimeout(url);
  if (!data || !data.results || data.results.length === 0) return null;
  return data.results[0];
}

function extractText(field) {
  if (!field) return '';
  if (Array.isArray(field)) return field.join(' ');
  return String(field);
}

function findMentions(text, drugName) {
  if (!text || !drugName) return [];
  const lower = text.toLowerCase();
  const target = drugName.toLowerCase();
  const mentions = [];
  // Find sentences containing the drug name
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    if (s.toLowerCase().includes(target)) {
      mentions.push(s.trim().slice(0, 500));
    }
  }
  return mentions;
}

async function checkInteractions(drug1, drug2) {
  if (!drug1 || !drug2) return { error: 'Two drug names required. Use ?drug1=aspirin&drug2=warfarin' };

  const d1 = drug1.trim().toLowerCase();
  const d2 = drug2.trim().toLowerCase();

  const [label1, label2] = await Promise.all([getDrugLabel(d1), getDrugLabel(d2)]);

  if (!label1 && !label2) {
    return { error: `Neither "${drug1}" nor "${drug2}" found in FDA drug labels. Check spelling or try generic names.` };
  }
  if (!label1) return { error: `"${drug1}" not found in FDA drug labels. Check spelling or try the generic name.` };
  if (!label2) return { error: `"${drug2}" not found in FDA drug labels. Check spelling or try the generic name.` };

  const interactions = [];

  // Check drug1's label for mentions of drug2
  const sections1 = {
    drug_interactions: extractText(label1.drug_interactions),
    warnings: extractText(label1.warnings),
    contraindications: extractText(label1.contraindications),
  };

  for (const [section, text] of Object.entries(sections1)) {
    const mentions = findMentions(text, d2);
    for (const mention of mentions) {
      interactions.push({
        description: mention,
        foundIn: `${d1} label (${section.replace(/_/g, ' ')})`,
        source: 'FDA Drug Labels',
      });
    }
  }

  // Check drug2's label for mentions of drug1
  const sections2 = {
    drug_interactions: extractText(label2.drug_interactions),
    warnings: extractText(label2.warnings),
    contraindications: extractText(label2.contraindications),
  };

  for (const [section, text] of Object.entries(sections2)) {
    const mentions = findMentions(text, d1);
    for (const mention of mentions) {
      interactions.push({
        description: mention,
        foundIn: `${d2} label (${section.replace(/_/g, ' ')})`,
        source: 'FDA Drug Labels',
      });
    }
  }

  // Deduplicate by description
  const seen = new Set();
  const unique = [];
  for (const i of interactions) {
    const key = i.description.toLowerCase().slice(0, 100);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(i);
    }
  }

  const hasInteraction = unique.length > 0;

  // Pull the full drug_interactions section text for context (truncated)
  const interactionText1 = sections1.drug_interactions.slice(0, 1000) || null;
  const interactionText2 = sections2.drug_interactions.slice(0, 1000) || null;

  return {
    domain: 'drug-interactions',
    source: 'FDA Drug Labels (openFDA)',
    source_url: 'https://api.fda.gov',
    freshness: new Date().toISOString(),
    drugs: [d1, d2],
    interactions: unique,
    hasInteraction,
    interactionCount: unique.length,
    labelContext: {
      [d1]: interactionText1 ? interactionText1 : 'No drug interaction section found',
      [d2]: interactionText2 ? interactionText2 : 'No drug interaction section found',
    },
    summary: hasInteraction
      ? `${d1} and ${d2}: ${unique.length} interaction reference${unique.length === 1 ? '' : 's'} found in FDA labels`
      : `No direct references found between ${d1} and ${d2} in FDA labels. Check labelContext for full interaction sections.`,
    _agent_hint: 'labelContext contains the full drug interaction sections from each drug\'s FDA label. Parse these for comprehensive interaction data.',
  };
}

module.exports = { checkInteractions };
