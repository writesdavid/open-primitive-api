const fetch = require('node-fetch');

const NHTSA_BASE = 'https://api.nhtsa.gov';

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

async function getSafety(year, make, model) {
  if (!year || !make || !model) return { error: 'year, make, and model are required' };

  const [ratingsData, recallsData] = await Promise.all([
    fetchWithTimeout(`${NHTSA_BASE}/SafetyRatings/modelyear/${year}/make/${encodeURIComponent(make)}/model/${encodeURIComponent(model)}?format=json`),
    fetchWithTimeout(`${NHTSA_BASE}/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`)
  ]);

  const variants = ratingsData && ratingsData.Results ? ratingsData.Results : [];
  let ratings = null;

  if (variants.length > 0 && variants[0].VehicleId) {
    const detail = await fetchWithTimeout(`${NHTSA_BASE}/SafetyRatings/VehicleId/${variants[0].VehicleId}?format=json`);
    if (detail && detail.Results && detail.Results.length > 0) {
      ratings = detail.Results[0];
    }
  }

  const recalls = recallsData && recallsData.results ? recallsData.results : [];

  return {
    domain: 'cars',
    source: 'NHTSA',
    source_url: 'https://api.nhtsa.gov',
    freshness: new Date().toISOString(),
    year, make, model,
    ratings,
    variants: variants.map(v => ({ vehicleId: v.VehicleId, description: v.VehicleDescription })),
    recalls: recalls.map(r => ({
      component: r.Component,
      summary: r.Summary,
      consequence: r.Consequence,
      remedy: r.Remedy,
    })),
    recallCount: recalls.length,
  };
}

module.exports = { getSafety };
