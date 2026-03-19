const fetch = require('node-fetch');

const CMS_BASE = 'https://data.cms.gov/provider-data/api/1/datastore/query';
const RESOURCES = {
  general: 'xubh-q36u',
  mortality: 'ynj2-r877',
  readmissions: '632h-zaca',
  experience: 'dgck-syfz',
};

async function cmsQuery(resourceId, filters, limit = 10) {
  const url = `${CMS_BASE}/${resourceId}/0`;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ limit, offset: 0, filters, sort: [], keys: true }),
    });
    clearTimeout(id);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    clearTimeout(id);
    return [];
  }
}

function normalizeComparison(val) {
  if (!val) return null;
  const v = val.toLowerCase();
  if (v.includes('better')) return 'better';
  if (v.includes('worse')) return 'worse';
  if (v.includes('same') || v.includes('no different')) return 'same';
  return null;
}

async function searchHospitals(query) {
  if (!query) return { error: 'Search query required' };

  const isZip = /^\d{5}$/.test(query);
  const property = isZip ? 'zip_code' : 'hospital_name';
  const operator = isZip ? '=' : 'CONTAINS';

  const results = await cmsQuery(RESOURCES.general, {
    conditions: [{ property, value: query, operator }],
  });

  return {
    domain: 'hospitals',
    source: 'CMS Care Compare',
    source_url: 'https://data.cms.gov',
    freshness: new Date().toISOString(),
    query,
    results: results.map(h => ({
      providerId: h.provider_id || h.facility_id,
      name: h.hospital_name || h.facility_name,
      city: h.city,
      state: h.state,
      zip: h.zip_code,
      overallRating: h.overall_rating || null,
      type: h.hospital_type,
      phone: h.phone_number,
    })),
    count: results.length,
  };
}

async function getHospital(providerId) {
  if (!providerId) return { error: 'Provider ID required' };

  const [general, mortality, readmissions, experience] = await Promise.all([
    cmsQuery(RESOURCES.general, { conditions: [{ property: 'provider_id', value: providerId, operator: '=' }] }, 1),
    cmsQuery(RESOURCES.mortality, { conditions: [{ property: 'facility_id', value: providerId, operator: '=' }] }),
    cmsQuery(RESOURCES.readmissions, { conditions: [{ property: 'facility_id', value: providerId, operator: '=' }] }),
    cmsQuery(RESOURCES.experience, { conditions: [{ property: 'facility_id', value: providerId, operator: '=' }] }),
  ]);

  const info = general[0] || {};

  return {
    domain: 'hospitals',
    source: 'CMS Care Compare',
    source_url: 'https://data.cms.gov',
    freshness: new Date().toISOString(),
    providerId,
    name: info.hospital_name || info.facility_name || '',
    city: info.city || '',
    state: info.state || '',
    zip: info.zip_code || '',
    phone: info.phone_number || '',
    type: info.hospital_type || '',
    overallRating: info.overall_rating || null,
    mortality: mortality.filter(m => /mortality|death/i.test(m.measure_name || m.measure_id || '')).map(m => ({
      measure: m.measure_name,
      score: m.score,
      comparison: normalizeComparison(m.compared_to_national),
    })),
    readmissions: readmissions.filter(r => /readmission|return/i.test(r.measure_name || r.measure_id || '')).map(r => ({
      measure: r.measure_name,
      score: r.score,
      comparison: normalizeComparison(r.compared_to_national),
    })),
    patientExperience: experience.filter(e => /summary|overall|linear/i.test(e.hcahps_measure_id || e.measure_id || '')).map(e => ({
      measure: e.hcahps_question || e.measure_name,
      score: e.patient_survey_star_rating || e.score,
      comparison: normalizeComparison(e.patient_survey_star_rating_footnote),
    })),
  };
}

module.exports = { searchHospitals, getHospital };
