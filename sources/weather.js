const fetch = require('node-fetch');

const USER_AGENT = 'OpenPrimitive/1.0 (davehamiltonj@gmail.com)';
const BASE = 'https://api.weather.gov';

const headers = { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' };

async function getForecast(lat, lng) {
  const pointsRes = await fetch(`${BASE}/points/${lat},${lng}`, { headers });
  if (!pointsRes.ok) throw new Error(`Points lookup failed: ${pointsRes.status}`);
  const pointsData = await pointsRes.json();

  const forecastUrl = pointsData.properties.forecast;
  const forecastRes = await fetch(forecastUrl, { headers });
  if (!forecastRes.ok) throw new Error(`Forecast fetch failed: ${forecastRes.status}`);
  const forecastData = await forecastRes.json();

  const periods = forecastData.properties.periods.map(p => ({
    name: p.name,
    temperature: p.temperature,
    temperatureUnit: p.temperatureUnit,
    windSpeed: p.windSpeed,
    windDirection: p.windDirection,
    shortForecast: p.shortForecast,
    detailedForecast: p.detailedForecast
  }));

  return {
    domain: 'weather',
    source: 'NOAA National Weather Service',
    source_url: 'https://api.weather.gov',
    freshness: new Date().toISOString(),
    location: { lat, lng },
    periods
  };
}

async function getAlerts(state) {
  const res = await fetch(`${BASE}/alerts/active?area=${state}`, { headers });
  if (!res.ok) throw new Error(`Alerts fetch failed: ${res.status}`);
  const data = await res.json();

  const alerts = (data.features || []).map(f => ({
    event: f.properties.event,
    severity: f.properties.severity,
    headline: f.properties.headline,
    description: f.properties.description,
    onset: f.properties.onset,
    expires: f.properties.expires,
    areas: f.properties.areaDesc
  }));

  return {
    domain: 'weather',
    source: 'NOAA National Weather Service',
    source_url: 'https://api.weather.gov',
    freshness: new Date().toISOString(),
    state,
    alerts,
    count: alerts.length
  };
}

async function getForecastByZip(zip) {
  const geocodeUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${zip}&benchmark=Public_AR_Current&format=json`;
  const res = await fetch(geocodeUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
  const data = await res.json();

  const matches = data.result && data.result.addressMatches;
  if (!matches || matches.length === 0) throw new Error(`No location found for ZIP: ${zip}`);

  const { x: lng, y: lat } = matches[0].coordinates;
  return getForecast(lat, lng);
}

module.exports = { getForecast, getAlerts, getForecastByZip };
