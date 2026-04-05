const fetch = require('node-fetch');

const USER_AGENT = 'OpenPrimitive/1.0 (davehamiltonj@gmail.com)';
const BASE = 'https://api.data.gov/ed/collegescorecard/v1';

const DEFAULT_FIELDS = [
  'id',
  'school.name',
  'school.state',
  'school.city',
  'latest.admissions.admission_rate.overall',
  'latest.cost.attendance.academic_year',
  'latest.earnings.10_yrs_after_entry.median',
  'latest.student.size'
].join(',');

function makeController() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function envelope(query, results) {
  return {
    domain: 'education',
    source: 'College Scorecard (US Dept of Education)',
    source_url: 'https://collegescorecard.ed.gov',
    freshness: new Date().toISOString(),
    query,
    results
  };
}

async function searchSchools({ name, state, zip, fields } = {}) {
  const params = new URLSearchParams();
  if (name) params.set('school.name', name);
  if (state) params.set('school.state', state);
  if (zip) params.set('zip', zip);
  params.set('fields', fields || DEFAULT_FIELDS);
  params.set('per_page', '20');
  params.set('api_key', 'DEMO_KEY');

  const { signal, clear } = makeController();
  try {
    const res = await fetch(`${BASE}/schools.json?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal
    });
    clear();
    if (!res.ok) return envelope({ name, state, zip }, []);
    const data = await res.json();
    return envelope({ name, state, zip }, data.results || []);
  } catch (e) {
    clear();
    return envelope({ name, state, zip }, []);
  }
}

async function getSchool(id) {
  const params = new URLSearchParams();
  params.set('fields', DEFAULT_FIELDS);
  params.set('api_key', 'DEMO_KEY');

  const { signal, clear } = makeController();
  try {
    const res = await fetch(`${BASE}/schools.json?id=${id}&${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal
    });
    clear();
    if (!res.ok) return envelope({ id }, null);
    const data = await res.json();
    const results = data.results || [];
    return envelope({ id }, results.length ? results[0] : null);
  } catch (e) {
    clear();
    return envelope({ id }, null);
  }
}

async function compare(schoolIds, fields) {
  const params = new URLSearchParams();
  params.set('id', schoolIds.join(','));
  params.set('fields', fields || DEFAULT_FIELDS);
  params.set('api_key', 'DEMO_KEY');

  const { signal, clear } = makeController();
  try {
    const res = await fetch(`${BASE}/schools.json?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal
    });
    clear();
    if (!res.ok) return envelope({ schoolIds }, []);
    const data = await res.json();
    return envelope({ schoolIds }, data.results || []);
  } catch (e) {
    clear();
    return envelope({ schoolIds }, []);
  }
}

module.exports = { searchSchools, getSchool, compare };
