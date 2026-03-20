const water = require('./water');
const hospitals = require('./hospitals');
const weather = require('./weather');
const demographics = require('./demographics');

async function getRiskProfile(zip) {
  if (!/^\d{5}$/.test(zip)) return { error: 'Valid 5-digit ZIP code required' };

  const [waterResult, hospitalResult, weatherResult, demoResult] = await Promise.allSettled([
    water.searchByZip(zip),
    hospitals.searchHospitals(zip),
    weather.getForecastByZip(zip),
    demographics.getByZip(zip),
  ]);

  // ─── WATER (0-25) ───
  let waterFactor = { score: 0, violations: 0, note: 'No data available' };
  if (waterResult.status === 'fulfilled' && !waterResult.value.error) {
    const systems = (waterResult.value.systems || []).slice(0, 5);
    const details = await Promise.all(
      systems.map(s => water.getSystem(s.pwsid).catch(() => null))
    );
    let violations = 0;
    for (const d of details) {
      if (!d || !d.violations) continue;
      violations += (d.violations.healthBased || []).length;
    }
    // 0 violations = 0 risk, each violation adds 5, cap at 25
    const score = Math.min(25, violations * 5);
    waterFactor = {
      score,
      violations,
      note: violations === 0 ? 'No health violations found' : `${violations} health violation${violations > 1 ? 's' : ''} found`,
    };
  }

  // ─── HEALTHCARE (0-25) ───
  let healthcareFactor = { score: 12, avgRating: null, note: 'No data available' };
  if (hospitalResult.status === 'fulfilled' && !hospitalResult.value.error) {
    const results = hospitalResult.value.results || [];
    const rated = results.filter(h => h.overallRating && !isNaN(parseInt(h.overallRating)));
    const ratings = rated.map(h => parseInt(h.overallRating));
    const avg = ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
      : null;
    // 5-star avg = 0 risk, 1-star avg = 25 risk. Invert the rating.
    const score = avg !== null ? Math.round((1 - avg / 5) * 25) : 12;
    const label = avg !== null ? `Average hospital rating ${avg}/5` : 'No rated hospitals nearby';
    healthcareFactor = { score, avgRating: avg, note: label };
  }

  // ─── WEATHER (0-25) ───
  let weatherFactor = { score: 0, alerts: 0, note: 'No data available' };
  if (weatherResult.status === 'fulfilled' && !weatherResult.value.error) {
    const data = weatherResult.value;
    const alertCount = (data.alerts || []).length;
    // Each alert adds 8 points, cap at 25
    const score = Math.min(25, alertCount * 8);
    weatherFactor = {
      score,
      alerts: alertCount,
      note: alertCount === 0 ? 'No active weather alerts' : `${alertCount} active weather alert${alertCount > 1 ? 's' : ''}`,
    };
  }

  // ─── ECONOMIC (0-25) ───
  let economicFactor = { score: 12, povertyRate: null, note: 'No data available' };
  if (demoResult.status === 'fulfilled' && !demoResult.value.error) {
    const data = demoResult.value;
    const poverty = data.povertyRate != null ? parseFloat(data.povertyRate) : null;
    if (poverty !== null && !isNaN(poverty)) {
      // National avg ~12%. Scale: 0% = 0 risk, 50%+ = 25 risk
      const score = Math.min(25, Math.round((poverty / 50) * 25));
      economicFactor = { score, povertyRate: poverty, note: `${poverty}% poverty rate` };
    }
  }

  const riskScore = waterFactor.score + healthcareFactor.score + weatherFactor.score + economicFactor.score;

  // Build summary
  let level = 'Low';
  if (riskScore >= 60) level = 'High';
  else if (riskScore >= 35) level = 'Moderate';
  else if (riskScore >= 15) level = 'Low-moderate';

  const parts = [];
  if (waterFactor.violations > 0) parts.push(`${waterFactor.violations} water violation${waterFactor.violations > 1 ? 's' : ''}`);
  if (healthcareFactor.avgRating !== null && healthcareFactor.avgRating < 3) parts.push('below-average hospitals');
  if (weatherFactor.alerts > 0) parts.push(`${weatherFactor.alerts} weather alert${weatherFactor.alerts > 1 ? 's' : ''}`);
  if (economicFactor.povertyRate !== null && economicFactor.povertyRate > 20) parts.push(`${economicFactor.povertyRate}% poverty`);

  const detail = parts.length > 0 ? ' ' + parts.join(', ') + '.' : '';
  const summary = `ZIP ${zip} risk score: ${riskScore}/100. ${level} risk.${detail}`;

  return {
    domain: 'risk',
    source: 'EPA + CMS + NOAA + Census',
    freshness: new Date().toISOString(),
    zip,
    riskScore,
    factors: {
      water: waterFactor,
      healthcare: healthcareFactor,
      weather: weatherFactor,
      economic: economicFactor,
    },
    summary,
  };
}

module.exports = { getRiskProfile };
