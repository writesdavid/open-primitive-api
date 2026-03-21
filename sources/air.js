const fetch = require('node-fetch');

const API_KEY = process.env.AIRNOW_API_KEY || 'DEMO_KEY';
const BASE = 'https://www.airnowapi.org/aq';

function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function getAirQuality(zip) {
  if (!zip) return { error: 'zip parameter is required' };

  const url = `${BASE}/observation/zipCode/current/?format=application/json&zipCode=${zip}&API_KEY=${API_KEY}`;
  const res = await fetchWithTimeout(url);
  const data = await res.json();

  if (!data || data.length === 0) {
    return { error: 'No air quality data found for this ZIP code', zip };
  }

  // Find the highest AQI observation (the dominant pollutant)
  const worst = data.reduce((a, b) => (b.AQI > a.AQI ? b : a), data[0]);

  return {
    domain: 'air',
    source: 'EPA AirNow',
    source_url: 'https://www.airnow.gov',
    freshness: new Date().toISOString(),
    zip,
    aqi: worst.AQI,
    category: worst.Category.Name,
    pollutant: worst.ParameterName,
    observations: data.map(d => ({
      parameter: d.ParameterName,
      aqi: d.AQI,
      category: d.Category.Name,
      date_observed: d.DateObserved,
      hour_observed: d.HourObserved,
      reporting_area: d.ReportingArea,
      state: d.StateCode,
    })),
  };
}

async function getAirForecast(zip) {
  if (!zip) return { error: 'zip parameter is required' };

  const url = `${BASE}/forecast/zipCode/?format=application/json&zipCode=${zip}&API_KEY=${API_KEY}`;
  const res = await fetchWithTimeout(url);
  const data = await res.json();

  if (!data || data.length === 0) {
    return { error: 'No air quality forecast found for this ZIP code', zip };
  }

  const worst = data.reduce((a, b) => (b.AQI > a.AQI ? b : a), data[0]);

  return {
    domain: 'air',
    source: 'EPA AirNow',
    source_url: 'https://www.airnow.gov',
    freshness: new Date().toISOString(),
    zip,
    aqi: worst.AQI,
    category: worst.Category.Name,
    pollutant: worst.ParameterName,
    forecasts: data.map(d => ({
      parameter: d.ParameterName,
      aqi: d.AQI,
      category: d.Category.Name,
      date_forecast: d.DateForecast,
      reporting_area: d.ReportingArea,
      state: d.StateCode,
      discussion: d.Discussion || null,
    })),
  };
}

module.exports = { getAirQuality, getAirForecast };
