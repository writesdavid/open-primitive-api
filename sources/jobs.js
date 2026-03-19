const fetch = require('node-fetch');

const BLS_API = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';

// Common series IDs:
// LNS14000000  — Unemployment rate (seasonally adjusted)
// CUUR0000SA0  — CPI, all urban consumers (seasonally adjusted)
// CES0000000001 — Total nonfarm payrolls (seasonally adjusted)

function fetchWithTimeout(url, options, timeout = 10000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('BLS API request timed out')), timeout)
    )
  ]);
}

async function fetchSeries(seriesId) {
  const now = new Date();
  const endYear = now.getFullYear().toString();
  const startYear = (now.getFullYear() - 1).toString();

  const res = await fetchWithTimeout(BLS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seriesid: [seriesId],
      startyear: startYear,
      endyear: endYear
    })
  });

  if (!res.ok) {
    throw new Error('BLS API returned ' + res.status);
  }

  const json = await res.json();

  if (json.status !== 'REQUEST_SUCCEEDED' || !json.Results || !json.Results.series || !json.Results.series.length) {
    throw new Error('BLS API error: ' + (json.message || 'no data'));
  }

  const series = json.Results.series[0];
  const data = series.data || [];

  // BLS returns newest first
  const points = data.map(d => ({
    year: d.year,
    month: d.period.replace('M', ''),
    value: d.value
  }));

  const latest = points[0] || null;

  return {
    domain: 'jobs',
    source: 'Bureau of Labor Statistics',
    source_url: 'https://www.bls.gov/',
    freshness: latest ? latest.year + '-' + latest.month : null,
    series: seriesId,
    latest: latest,
    history: points
  };
}

async function getUnemployment() {
  const result = await fetchSeries('LNS14000000');
  result.series = 'unemployment_rate';
  return result;
}

async function getSeriesData(seriesId) {
  return fetchSeries(seriesId);
}

module.exports = { getUnemployment, getSeriesData };
