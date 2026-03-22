const fetch = require('node-fetch');

const CT_BASE = 'https://clinicaltrials.gov/api/v2/studies';

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

async function searchTrials(query) {
  if (!query) return { error: 'query parameter is required (condition or intervention)' };
  const encoded = encodeURIComponent(query);
  const url = `${CT_BASE}?query.cond=${encoded}&pageSize=10`;
  const data = await fetchWithTimeout(url);
  if (!data) return { error: 'ClinicalTrials.gov API unavailable' };
  const studies = data.studies || [];
  return {
    domain: 'clinical-trials',
    source: 'ClinicalTrials.gov',
    source_url: 'https://clinicaltrials.gov',
    freshness: new Date().toISOString(),
    query,
    trials: studies.map(s => {
      const proto = s.protocolSection || {};
      const id = proto.identificationModule || {};
      const status = proto.statusModule || {};
      const conditions = proto.conditionsModule || {};
      const arms = proto.armsInterventionsModule || {};
      const sponsor = proto.sponsorCollaboratorsModule || {};
      return {
        nctId: id.nctId || null,
        title: id.officialTitle || id.briefTitle || null,
        status: status.overallStatus || null,
        conditions: (conditions.conditions || []),
        interventions: (arms.interventions || []).map(i => i.name).filter(Boolean),
        startDate: status.startDateStruct ? status.startDateStruct.date : null,
        sponsor: sponsor.leadSponsor ? sponsor.leadSponsor.name : null,
      };
    }),
    count: studies.length,
  };
}

module.exports = { searchTrials };
