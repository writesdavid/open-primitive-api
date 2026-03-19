const demographics = require('./demographics');
const safety = require('./safety');

async function getLocationProfile(zip) {
  if (!/^\d{5}$/.test(zip)) return { error: 'Valid 5-digit ZIP code required' };

  const [demoData, safetyData] = await Promise.allSettled([
    demographics.getByZip(zip),
    safety.getSafetyProfile(zip),
  ]);

  const demo = demoData.status === 'fulfilled' ? demoData.value : null;
  const safe = safetyData.status === 'fulfilled' ? safetyData.value : null;

  const population = demo ? demo.population : null;
  const medianIncome = demo ? demo.medianIncome : null;
  const safetyScore = safe ? safe.safetyScore : null;

  const parts = [`ZIP ${zip}`];
  if (population) parts.push(`population ${population.toLocaleString()}`);
  if (medianIncome && medianIncome > 0) parts.push(`median income $${medianIncome.toLocaleString()}`);
  if (safetyScore !== null) parts.push(`safety score ${safetyScore}/100`);
  const summary = parts.join(', ');

  return {
    domain: 'location',
    source: 'Census + EPA + CMS',
    source_url: 'https://api.openprimitive.com',
    freshness: new Date().toISOString(),
    zip,
    demographics: {
      population,
      medianIncome,
      povertyRate: demo ? demo.povertyRate : null,
      collegeRate: demo ? demo.collegeRate : null,
      medianHomeValue: demo ? demo.medianHomeValue : null,
      medianRent: demo ? demo.medianRent : null,
    },
    safety: {
      score: safetyScore,
      water: {
        systemCount: safe ? safe.water.systemCount : null,
        healthViolations: safe ? safe.water.healthViolations : null,
      },
      hospitals: {
        count: safe ? safe.hospitals.count : null,
        avgRating: safe ? safe.hospitals.averageRating : null,
      },
    },
    summary,
  };
}

module.exports = { getLocationProfile };
