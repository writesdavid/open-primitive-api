const fetch = require('node-fetch');

const USGS_BASE = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

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

async function getRecent() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const starttime = yesterday.toISOString().slice(0, 19);
  const url = `${USGS_BASE}?format=geojson&starttime=${starttime}&minmagnitude=2.5&limit=20`;
  const data = await fetchWithTimeout(url);
  if (!data) return { error: 'USGS Earthquake API unavailable' };
  const features = data.features || [];
  return {
    domain: 'earthquakes',
    source: 'USGS',
    source_url: 'https://earthquake.usgs.gov',
    freshness: new Date().toISOString(),
    quakes: features.map(f => ({
      id: f.id,
      magnitude: f.properties.mag,
      place: f.properties.place,
      time: new Date(f.properties.time).toISOString(),
      depth: f.geometry.coordinates[2],
      url: f.properties.url,
    })),
    count: features.length,
  };
}

module.exports = { getRecent };
