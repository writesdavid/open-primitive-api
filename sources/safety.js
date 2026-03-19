const water = require('./water');
const hospitals = require('./hospitals');

async function getSafetyProfile(zip) {
  if (!/^\d{5}$/.test(zip)) return { error: 'Valid 5-digit ZIP code required' };

  const [waterData, hospitalData] = await Promise.all([
    water.searchByZip(zip),
    hospitals.searchHospitals(zip),
  ]);

  // Water analysis: fetch violations for each system
  const waterSystems = waterData.systems || [];
  let healthViolationCount = 0;
  const contaminantSet = new Set();

  // Fetch violations for up to 5 systems to keep response time reasonable
  const systemsToCheck = waterSystems.slice(0, 5);
  const violationResults = await Promise.all(
    systemsToCheck.map(s => water.getSystem(s.pwsid).catch(() => null))
  );

  for (const result of violationResults) {
    if (!result || !result.violations) continue;
    const hb = result.violations.healthBased || [];
    healthViolationCount += hb.length;
    for (const v of hb) {
      if (v.contaminant) contaminantSet.add(v.contaminant);
    }
  }

  // Hospital analysis
  const hospitalResults = hospitalData.results || [];
  const rated = hospitalResults.filter(h => h.overallRating && !isNaN(parseInt(h.overallRating)));
  const ratings = rated.map(h => parseInt(h.overallRating));
  const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;

  let best = null;
  let worst = null;
  if (rated.length > 0) {
    const sorted = [...rated].sort((a, b) => parseInt(b.overallRating) - parseInt(a.overallRating));
    best = { name: sorted[0].name, rating: parseInt(sorted[0].overallRating) };
    worst = { name: sorted[sorted.length - 1].name, rating: parseInt(sorted[sorted.length - 1].overallRating) };
  }

  // Composite score: 0-100
  // Water component (50 points): start at 50, subtract 10 per health violation, floor at 0
  const waterScore = Math.max(0, 50 - (healthViolationCount * 10));
  // Hospital component (50 points): average rating (1-5) mapped to 0-50
  const hospitalScore = avgRating ? Math.round((avgRating / 5) * 50) : 25; // 25 = neutral if no data
  const safetyScore = waterScore + hospitalScore;

  return {
    domain: 'safety',
    source: 'EPA SDWIS + CMS Care Compare',
    source_url: 'https://api.openprimitive.com/v1/safety',
    freshness: new Date().toISOString(),
    zip,
    safetyScore,
    water: {
      systemCount: waterSystems.length,
      healthViolations: healthViolationCount,
      worstContaminants: [...contaminantSet].slice(0, 10),
      score: waterScore,
    },
    hospitals: {
      count: hospitalResults.length,
      averageRating: avgRating,
      best,
      worst,
      score: hospitalScore,
    },
  };
}

module.exports = { getSafetyProfile };
