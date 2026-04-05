const fetch = require('node-fetch');

const USER_AGENT = 'OpenPrimitive/1.0 (davehamiltonj@gmail.com)';
const EIA_BASE = 'https://api.eia.gov/v2';
const FCC_BASE = 'https://broadbandmap.fcc.gov/api';

function makeController() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function envelope(domain, query, results) {
  return {
    domain: 'infrastructure',
    source: domain,
    source_url: domain === 'EIA' ? 'https://www.eia.gov' : 'https://broadbandmap.fcc.gov',
    freshness: new Date().toISOString(),
    query,
    results
  };
}

async function getElectricityPrice({ state } = {}) {
  const params = new URLSearchParams();
  params.set('frequency', 'monthly');
  params.set('data[0]', 'price');
  params.set('sort[0][column]', 'period');
  params.set('sort[0][direction]', 'desc');
  params.set('length', '12');
  if (state) params.set('facets[stateid][]', state);
  params.set('api_key', 'DEMO_KEY');

  const { signal, clear } = makeController();
  try {
    const res = await fetch(`${EIA_BASE}/electricity/retail-sales/data/?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal
    });
    clear();
    if (!res.ok) return envelope('EIA', { state, metric: 'electricity_price' }, []);
    const data = await res.json();
    const results = (data.response && data.response.data) || [];
    return envelope('EIA', { state, metric: 'electricity_price' }, results);
  } catch (e) {
    clear();
    return envelope('EIA', { state, metric: 'electricity_price' }, []);
  }
}

async function getNaturalGasPrice({ state } = {}) {
  const params = new URLSearchParams();
  params.set('frequency', 'monthly');
  params.set('data[0]', 'value');
  params.set('sort[0][column]', 'period');
  params.set('sort[0][direction]', 'desc');
  params.set('length', '12');
  if (state) params.set('facets[duoarea][]', `S${state}`);
  params.set('api_key', 'DEMO_KEY');

  const { signal, clear } = makeController();
  try {
    const res = await fetch(`${EIA_BASE}/natural-gas/pri/sum/data/?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal
    });
    clear();
    if (!res.ok) return envelope('EIA', { state, metric: 'natural_gas_price' }, []);
    const data = await res.json();
    const results = (data.response && data.response.data) || [];
    return envelope('EIA', { state, metric: 'natural_gas_price' }, results);
  } catch (e) {
    clear();
    return envelope('EIA', { state, metric: 'natural_gas_price' }, []);
  }
}

async function getEnergyOutlook() {
  const params = new URLSearchParams();
  params.set('frequency', 'monthly');
  params.set('data[0]', 'value');
  params.set('sort[0][column]', 'period');
  params.set('sort[0][direction]', 'desc');
  params.set('length', '12');
  params.set('api_key', 'DEMO_KEY');

  const { signal, clear } = makeController();
  try {
    const res = await fetch(`${EIA_BASE}/steo/data/?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal
    });
    clear();
    if (!res.ok) return envelope('EIA', { metric: 'energy_outlook' }, []);
    const data = await res.json();
    const results = (data.response && data.response.data) || [];
    return envelope('EIA', { metric: 'energy_outlook' }, results);
  } catch (e) {
    clear();
    return envelope('EIA', { metric: 'energy_outlook' }, []);
  }
}

async function getBroadband({ zip, state } = {}) {
  const params = new URLSearchParams();
  if (zip) params.set('zip_code', zip);
  if (state) params.set('state_fips', state);
  params.set('speed_type', 'download');

  const { signal, clear } = makeController();
  try {
    const res = await fetch(`${FCC_BASE}/public/map/listAvailabilityByLocation?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal
    });
    clear();
    if (!res.ok) return envelope('FCC Broadband Map', { zip, state }, []);
    const data = await res.json();
    return envelope('FCC Broadband Map', { zip, state }, data.data || data.results || data);
  } catch (e) {
    clear();
    return envelope('FCC Broadband Map', { zip, state }, []);
  }
}

module.exports = { getElectricityPrice, getNaturalGasPrice, getEnergyOutlook, getBroadband };
