const fetch = require('node-fetch');

const URLS = {
  systemByZip: [
    'https://enviro.epa.gov/efservice/WATER_SYSTEM/ZIP_CODE/contains/{zip}/JSON',
    'https://data.epa.gov/efservice/WATER_SYSTEM/ZIP_CODE/{zip}/JSON',
  ],
  violations: [
    'https://enviro.epa.gov/efservice/VIOLATION/PWSID/EQUALS/{id}/JSON',
    'https://data.epa.gov/efservice/VIOLATION/PWSID/{id}/JSON',
  ],
  systemById: [
    'https://enviro.epa.gov/efservice/WATER_SYSTEM/PWSID/EQUALS/{id}/JSON',
    'https://data.epa.gov/efservice/WATER_SYSTEM/PWSID/{id}/JSON',
  ],
};

async function fetchWithFallback(urls, replacements, ms = 12000) {
  for (const template of urls) {
    let url = template;
    for (const [k, v] of Object.entries(replacements)) {
      url = url.replace(`{${k}}`, v);
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(id);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) return data;
    } catch {
      clearTimeout(id);
    }
  }
  return [];
}

function normalizeSystem(s) {
  return {
    pwsid: s.PWSID || s.pwsid,
    name: s.PWS_NAME || s.pws_name || s.WATER_SYSTEM_NAME || '',
    populationServed: parseInt(s.POPULATION_SERVED_COUNT || s.population_served_count || 0),
    type: s.PWS_TYPE_CODE || s.pws_type_code || '',
    primarySource: s.PRIMARY_SOURCE_CODE || s.primary_source_code || '',
    city: s.CITY_NAME || s.city_name || '',
    state: s.STATE_CODE || s.state_code || '',
  };
}

function normalizeViolation(v) {
  const isHealth = ['MCL', 'MRDL', 'TT'].includes(v.VIOLATION_CATEGORY_CODE || v.violation_category_code);
  return {
    contaminant: v.CONTAMINANT_NAME || v.contaminant_name || '',
    type: v.VIOLATION_TYPE_NAME || v.violation_type_name || '',
    category: v.VIOLATION_CATEGORY_CODE || v.violation_category_code || '',
    beginDate: v.COMPL_PER_BEGIN_DATE || v.compl_per_begin_date || '',
    endDate: v.COMPL_PER_END_DATE || v.compl_per_end_date || '',
    status: (v.COMPLIANCE_STATUS_CODE || v.compliance_status_code || '').includes('OPEN') ? 'open' : 'resolved',
    healthBased: isHealth,
  };
}

async function searchByZip(zip) {
  if (!/^\d{5}$/.test(zip)) return { error: 'Invalid ZIP code' };
  const systems = await fetchWithFallback(URLS.systemByZip, { zip });
  return {
    domain: 'water',
    source: 'EPA SDWIS',
    source_url: 'https://enviro.epa.gov',
    freshness: new Date().toISOString(),
    zip,
    systems: systems.slice(0, 20).map(normalizeSystem),
    count: systems.length,
  };
}

async function getSystem(pwsid) {
  if (!/^[A-Z0-9]{9,12}$/i.test(pwsid)) return { error: 'Invalid PWSID' };
  const [systemArr, violations] = await Promise.all([
    fetchWithFallback(URLS.systemById, { id: pwsid }),
    fetchWithFallback(URLS.violations, { id: pwsid }),
  ]);
  const system = systemArr.length > 0 ? normalizeSystem(systemArr[0]) : null;
  const normalized = violations.map(normalizeViolation);
  return {
    domain: 'water',
    source: 'EPA SDWIS',
    source_url: 'https://enviro.epa.gov',
    freshness: new Date().toISOString(),
    pwsid,
    system,
    violations: {
      healthBased: normalized.filter(v => v.healthBased),
      monitoring: normalized.filter(v => !v.healthBased),
      total: normalized.length,
    },
  };
}

module.exports = { searchByZip, getSystem };
