const fetch = require('node-fetch');

const AIRLINES = [
  { name: 'Delta', iata: 'DL', hubs: ['ATL', 'MSP', 'DTW', 'SLC'] },
  { name: 'United', iata: 'UA', hubs: ['ORD', 'EWR', 'IAH', 'DEN', 'SFO'] },
  { name: 'American', iata: 'AA', hubs: ['DFW', 'CLT', 'MIA', 'PHX', 'ORD'] },
  { name: 'Southwest', iata: 'WN', hubs: ['DAL', 'MDW', 'BWI', 'LAS', 'DEN'] },
  { name: 'Alaska', iata: 'AS', hubs: ['SEA', 'PDX', 'SFO'] },
  { name: 'JetBlue', iata: 'B6', hubs: ['JFK', 'BOS', 'FLL'] },
  { name: 'Allegiant', iata: 'G4', hubs: ['LAS', 'SFB', 'PIE'] },
  { name: 'Frontier', iata: 'F9', hubs: ['DEN', 'LAS', 'MCO'] },
];

const HUB_COORDS = {
  ATL: [33.64, -84.43], MSP: [44.88, -93.22], DTW: [42.21, -83.35], SLC: [40.79, -111.98],
  ORD: [41.97, -87.91], EWR: [40.69, -74.17], IAH: [29.98, -95.34], DEN: [39.86, -104.67],
  SFO: [37.62, -122.38], DFW: [32.90, -97.04], CLT: [35.21, -80.94], MIA: [25.79, -80.29],
  PHX: [33.43, -112.01], DAL: [32.85, -96.85], MDW: [41.79, -87.75], BWI: [39.18, -76.67],
  LAS: [36.08, -115.15], SEA: [47.45, -122.31], PDX: [45.59, -122.60],
  JFK: [40.64, -73.78], BOS: [42.36, -71.01], FLL: [26.07, -80.15],
  SFB: [28.78, -81.24], PIE: [27.91, -82.69], MCO: [28.43, -81.31],
};

async function fetchWithTimeout(url, ms = 10000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'OpenPrimitive/1.0' } });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    return null;
  }
}

async function getFaaDelays() {
  const res = await fetchWithTimeout('https://nasstatus.faa.gov/api/airport-status-information', 10000);
  if (!res) return {};
  try {
    const text = await res.text();
    const delays = {};
    const airportPattern = /IATA>(\w{3})<.*?Reason>(.*?)<.*?avgDelay>(.*?)</gs;
    let match;
    while ((match = airportPattern.exec(text)) !== null) {
      delays[match[1]] = { reason: match[2], delay: match[3] };
    }
    return delays;
  } catch { return {}; }
}

async function getWeather(hub) {
  const coords = HUB_COORDS[hub];
  if (!coords) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords[0]}&longitude=${coords[1]}&daily=weather_code,precipitation_sum&timezone=America/New_York&forecast_days=4`;
  const res = await fetchWithTimeout(url, 8000);
  if (!res) return null;
  try {
    const data = await res.json();
    return {
      hub,
      daily: data.daily ? data.daily.weather_code.map((code, i) => ({
        day: i + 1,
        weatherCode: code,
        precipitation: data.daily.precipitation_sum[i]
      })) : []
    };
  } catch { return null; }
}

// Exported query functions

async function getAirlines() {
  const [faaDelays, ...weatherResults] = await Promise.all([
    getFaaDelays(),
    ...AIRLINES.map(a => getWeather(a.hubs[0]))
  ]);

  return {
    domain: 'flights',
    source: 'FAA NAS + Open-Meteo',
    source_url: 'https://nasstatus.faa.gov',
    freshness: new Date().toISOString(),
    airlines: AIRLINES.map((airline, i) => {
      const hubDelays = airline.hubs
        .filter(h => faaDelays[h])
        .map(h => ({ airport: h, ...faaDelays[h] }));
      const weather = weatherResults[i];
      return {
        name: airline.name,
        iata: airline.iata,
        hubs: airline.hubs,
        delays: hubDelays,
        hasDelays: hubDelays.length > 0,
        weather: weather ? weather.daily : [],
        primaryHub: airline.hubs[0],
      };
    })
  };
}

async function getAirline(iata) {
  const airline = AIRLINES.find(a => a.iata.toUpperCase() === iata.toUpperCase());
  if (!airline) return null;
  const [faaDelays, weather] = await Promise.all([
    getFaaDelays(),
    getWeather(airline.hubs[0])
  ]);
  const hubDelays = airline.hubs
    .filter(h => faaDelays[h])
    .map(h => ({ airport: h, ...faaDelays[h] }));
  return {
    domain: 'flights',
    source: 'FAA NAS + Open-Meteo',
    freshness: new Date().toISOString(),
    name: airline.name,
    iata: airline.iata,
    hubs: airline.hubs,
    delays: hubDelays,
    hasDelays: hubDelays.length > 0,
    weather: weather ? weather.daily : [],
  };
}

module.exports = { getAirlines, getAirline, AIRLINES };
