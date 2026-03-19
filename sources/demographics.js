const fetch = require('node-fetch');

const API_BASE = 'https://api.census.gov/data';

function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function getByZip(zip) {
  const variables = [
    'NAME',
    'B01003_001E', // total population
    'B19013_001E', // median household income
    'B17001_002E', // poverty count
    'B17001_001E', // poverty universe total
    'B15003_022E', // bachelor's
    'B15003_023E', // master's
    'B15003_024E', // professional
    'B15003_025E', // doctorate
    'B25077_001E', // median home value
    'B25064_001E', // median gross rent
  ];

  const url = `${API_BASE}/2023/acs/acs5?get=${variables.join(',')}&for=zip%20code%20tabulation%20area:${zip}`;
  const res = await fetchWithTimeout(url);

  if (!res.ok) {
    throw new Error(`Census API returned ${res.status}`);
  }

  const rows = await res.json();

  if (!rows || rows.length < 2) {
    throw new Error(`No data found for ZIP ${zip}`);
  }

  const headers = rows[0];
  const values = rows[1];
  const data = {};
  headers.forEach((h, i) => { data[h] = values[i]; });

  const population = Number(data['B01003_001E']);
  const medianIncome = Number(data['B19013_001E']);
  const povertyCount = Number(data['B17001_002E']);
  const povertyTotal = Number(data['B17001_001E']);
  const bachelors = Number(data['B15003_022E']);
  const masters = Number(data['B15003_023E']);
  const professional = Number(data['B15003_024E']);
  const doctorate = Number(data['B15003_025E']);
  const medianHomeValue = Number(data['B25077_001E']);
  const medianRent = Number(data['B25064_001E']);

  const povertyRate = povertyTotal > 0 ? Math.round((povertyCount / povertyTotal) * 1000) / 10 : null;
  const collegePlus = bachelors + masters + professional + doctorate;
  const collegeRate = population > 0 ? Math.round((collegePlus / population) * 1000) / 10 : null;

  return {
    domain: 'demographics',
    source: 'US Census ACS 5-Year',
    source_url: 'https://api.census.gov',
    freshness: '2023 5-year estimates',
    zip,
    population,
    medianIncome,
    povertyRate,
    collegeRate,
    medianHomeValue,
    medianRent,
  };
}

module.exports = { getByZip };
