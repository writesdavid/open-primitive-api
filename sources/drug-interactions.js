const fetch = require('node-fetch');

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST';

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

async function getRxCUI(drugName) {
  const url = `${RXNAV_BASE}/rxcui.json?name=${encodeURIComponent(drugName)}`;
  const data = await fetchWithTimeout(url);
  if (!data || !data.idGroup || !data.idGroup.rxnormId || data.idGroup.rxnormId.length === 0) {
    return null;
  }
  return data.idGroup.rxnormId[0];
}

async function checkInteractions(drug1, drug2) {
  if (!drug1 || !drug2) return { error: 'Two drug names required. Use ?drug1=aspirin&drug2=warfarin' };

  const d1 = drug1.trim().toLowerCase();
  const d2 = drug2.trim().toLowerCase();

  const [rxcui1, rxcui2] = await Promise.all([getRxCUI(d1), getRxCUI(d2)]);

  if (!rxcui1 && !rxcui2) {
    return { error: `Neither "${drug1}" nor "${drug2}" found in RxNorm. Check spelling or try generic names.` };
  }
  if (!rxcui1) return { error: `"${drug1}" not found in RxNorm. Check spelling or try the generic name.` };
  if (!rxcui2) return { error: `"${drug2}" not found in RxNorm. Check spelling or try the generic name.` };

  const url = `${RXNAV_BASE}/interaction/interaction.json?rxcui=${rxcui1}`;
  const data = await fetchWithTimeout(url);

  const interactions = [];

  if (data && data.interactionTypeGroup) {
    for (const group of data.interactionTypeGroup) {
      for (const type of group.interactionType || []) {
        for (const pair of type.interactionPair || []) {
          const concepts = pair.interactionConcept || [];
          const involvesDrug2 = concepts.some(
            (ic) => ic.minConceptItem && ic.minConceptItem.rxcui === rxcui2
          );
          if (involvesDrug2) {
            interactions.push({
              description: pair.description || 'No description available',
              severity: pair.severity || 'unknown',
              source: type.interactionTypeSource || 'RxNav',
            });
          }
        }
      }
    }
  }

  const hasInteraction = interactions.length > 0;

  return {
    domain: 'drug-interactions',
    source: 'NIH RxNav',
    source_url: 'https://rxnav.nlm.nih.gov',
    freshness: new Date().toISOString(),
    drugs: [d1, d2],
    rxcuis: { [d1]: rxcui1, [d2]: rxcui2 },
    interactions,
    hasInteraction,
    interactionCount: interactions.length,
    summary: hasInteraction
      ? `${d1} and ${d2} have ${interactions.length} known interaction${interactions.length === 1 ? '' : 's'}`
      : `No known interactions found between ${d1} and ${d2}`,
  };
}

module.exports = { checkInteractions };
