/**
 * entity-graph.js — Cross-domain entity resolution for Open Primitive API
 *
 * Stitches data across all 26 domains by common identifiers: ZIP code,
 * company (CIK/ticker), drug name, geographic coordinates, FIPS code.
 *
 * Source modules are passed in at runtime (dependency injection).
 * Expected shape of sourceModules:
 *   { water, air, weather, demographics, hospitals, earthquakes, location,
 *     eligible, sec, drugs, food, products, spending, clinicalTrials,
 *     drugInteractions, dailymed, health, jobs, safety }
 */

const DOMAIN_TIMEOUT_MS = 10000;

// ─── Entity type definitions ───

const ENTITY_TYPES = {
  zip: {
    domains: ['water', 'air', 'weather', 'demographics', 'hospitals', 'earthquakes', 'location', 'eligible'],
    resolver: (zip, modules) => ({
      water:        () => modules.water.searchByZip(zip),
      air:          () => modules.air.getAirQuality(zip),
      weather:      () => modules.weather.getForecastByZip(zip),
      demographics: () => modules.demographics.getByZip(zip),
      hospitals:    () => modules.hospitals.searchHospitals(zip),
      earthquakes:  () => modules.earthquakes.getRecent(),
      location:     () => modules.location.getLocationProfile(zip),
      eligible:     () => modules.eligible.checkEligibility({ zip }),
    }),
  },

  company: {
    domains: ['sec', 'drugs', 'food', 'products', 'spending'],
    resolver: (identifier, modules) => ({
      sec:      () => modules.sec.searchCompany(identifier),
      drugs:    () => modules.drugs.getDrug(identifier),
      food:     () => modules.food.search(identifier),
      products: () => modules.products.search(identifier),
      spending: () => modules.spending.searchSpending(identifier),
    }),
  },

  drug: {
    domains: ['drugs', 'clinicalTrials', 'drugInteractions', 'dailymed', 'health'],
    resolver: (drugName, modules) => ({
      drugs:            () => modules.drugs.getDrug(drugName),
      clinicalTrials:   () => modules.clinicalTrials.searchTrials(drugName),
      drugInteractions: () => modules.drugInteractions.checkInteractions(drugName, ''),
      dailymed:         () => modules.dailymed.searchLabels(drugName),
      health:           () => modules.health.searchHealth(drugName),
    }),
  },

  geographic: {
    domains: ['water', 'air', 'weather', 'earthquakes', 'demographics', 'hospitals'],
    resolver: (coords, modules) => {
      const { lat, lon, zip } = coords;
      return {
        water:        zip ? () => modules.water.searchByZip(zip) : null,
        air:          zip ? () => modules.air.getAirQuality(zip) : null,
        weather:      () => modules.weather.getForecast(lat, lon),
        earthquakes:  () => modules.earthquakes.getRecent(),
        demographics: zip ? () => modules.demographics.getByZip(zip) : null,
        hospitals:    zip ? () => modules.hospitals.searchHospitals(zip) : null,
      };
    },
  },

  fips: {
    domains: ['demographics', 'spending', 'eligible', 'location'],
    resolver: (fipsCode, modules) => ({
      demographics: () => modules.demographics.getByZip(fipsCode),
      spending:     () => modules.spending.searchSpending(fipsCode),
      eligible:     () => modules.eligible.checkEligibility({ fips: fipsCode }),
      location:     () => modules.location.getLocationProfile(fipsCode),
    }),
  },
};

// ─── Timeout wrapper ───

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// ─── Corroboration scoring ───

function computeConfidence(domainResults) {
  const successCount = Object.values(domainResults).filter(
    (r) => r.status === 'ok' && r.data != null,
  ).length;
  const totalCount = Object.keys(domainResults).length;

  if (totalCount === 0) return 0;
  const baseConfidence = successCount / totalCount;
  // Each corroborating source above 1 adds 0.1
  const corroborating = Math.max(0, successCount - 1);
  return Math.min(1, baseConfidence * (1 + 0.1 * corroborating));
}

// ─── queryEntity ───

async function queryEntity(entityType, identifier, options = {}, sourceModules) {
  const entityDef = ENTITY_TYPES[entityType];
  if (!entityDef) {
    throw new Error(`Unknown entity type: ${entityType}`);
  }

  const timeout = options.timeout || DOMAIN_TIMEOUT_MS;
  const onlyDomains = options.domains || null; // optional filter

  const queries = entityDef.resolver(identifier, sourceModules);
  const results = {};
  const started = Date.now();

  const entries = Object.entries(queries).filter(([domain, fn]) => {
    if (!fn) return false;
    if (onlyDomains && !onlyDomains.includes(domain)) return false;
    return true;
  });

  const settled = await Promise.allSettled(
    entries.map(async ([domain, fn]) => {
      const t0 = Date.now();
      try {
        const data = await withTimeout(fn(), timeout);
        return { domain, status: 'ok', data, latencyMs: Date.now() - t0 };
      } catch (err) {
        return {
          domain,
          status: err.message === 'TIMEOUT' ? 'timeout' : 'error',
          error: err.message,
          latencyMs: Date.now() - t0,
        };
      }
    }),
  );

  for (const outcome of settled) {
    const val = outcome.status === 'fulfilled' ? outcome.value : {
      domain: 'unknown',
      status: 'error',
      error: outcome.reason?.message || 'Unknown error',
    };
    results[val.domain] = val;
  }

  const confidence = computeConfidence(results);

  return {
    entityType,
    identifier,
    queriedAt: new Date().toISOString(),
    totalMs: Date.now() - started,
    confidence,
    domains: results,
  };
}

// ─── correlate ───

function correlate(results) {
  const correlations = [];
  const domainData = results.domains || {};

  const okDomains = Object.entries(domainData)
    .filter(([, v]) => v.status === 'ok' && v.data)
    .map(([k, v]) => ({ domain: k, data: v.data }));

  // ZIP-based correlations: water quality + health indicators
  const waterResult = okDomains.find((d) => d.domain === 'water');
  const hospitalsResult = okDomains.find((d) => d.domain === 'hospitals');
  const demoResult = okDomains.find((d) => d.domain === 'demographics');
  const airResult = okDomains.find((d) => d.domain === 'air');

  if (waterResult && hospitalsResult) {
    const violations = extractViolations(waterResult.data);
    const hospitalCount = extractCount(hospitalsResult.data);
    if (violations > 0 && hospitalCount > 0) {
      correlations.push({
        domains: ['water', 'hospitals'],
        type: 'environmental-health',
        finding: `${violations} water violation(s) detected in area with ${hospitalCount} hospital(s)`,
        confidence: 0.7,
      });
    }
  }

  if (waterResult && demoResult) {
    const violations = extractViolations(waterResult.data);
    const income = extractMedianIncome(demoResult.data);
    if (violations > 0 && income && income < 50000) {
      correlations.push({
        domains: ['water', 'demographics'],
        type: 'environmental-justice',
        finding: `${violations} water violation(s) in area with median income $${income.toLocaleString()}`,
        confidence: 0.8,
      });
    }
  }

  if (airResult && hospitalsResult) {
    const aqi = extractAQI(airResult.data);
    const hospitalCount = extractCount(hospitalsResult.data);
    if (aqi && aqi > 100 && hospitalCount > 0) {
      correlations.push({
        domains: ['air', 'hospitals'],
        type: 'environmental-health',
        finding: `Unhealthy air quality (AQI ${aqi}) in area with ${hospitalCount} hospital(s)`,
        confidence: 0.7,
      });
    }
  }

  if (airResult && demoResult) {
    const aqi = extractAQI(airResult.data);
    const income = extractMedianIncome(demoResult.data);
    if (aqi && aqi > 100 && income && income < 50000) {
      correlations.push({
        domains: ['air', 'demographics'],
        type: 'environmental-justice',
        finding: `Unhealthy air quality (AQI ${aqi}) in lower-income area (median $${income.toLocaleString()})`,
        confidence: 0.8,
      });
    }
  }

  // Drug correlations: adverse events + clinical trials
  const drugsResult = okDomains.find((d) => d.domain === 'drugs');
  const trialsResult = okDomains.find((d) => d.domain === 'clinicalTrials');
  const dailymedResult = okDomains.find((d) => d.domain === 'dailymed');

  if (drugsResult && trialsResult) {
    const adverseCount = extractAdverseEventCount(drugsResult.data);
    const trialCount = extractCount(trialsResult.data);
    if (adverseCount > 0 && trialCount > 0) {
      correlations.push({
        domains: ['drugs', 'clinicalTrials'],
        type: 'pharmaceutical-safety',
        finding: `${adverseCount} adverse event(s) reported; ${trialCount} clinical trial(s) found`,
        confidence: 0.75,
      });
    }
  }

  if (drugsResult && dailymedResult) {
    correlations.push({
      domains: ['drugs', 'dailymed'],
      type: 'pharmaceutical-labeling',
      finding: 'FDA adverse event data and DailyMed labeling both available for cross-reference',
      confidence: 0.6,
    });
  }

  // Company correlations: SEC filings + product recalls/enforcement
  const secResult = okDomains.find((d) => d.domain === 'sec');
  const foodResult = okDomains.find((d) => d.domain === 'food');
  const productsResult = okDomains.find((d) => d.domain === 'products');

  if (secResult && foodResult) {
    correlations.push({
      domains: ['sec', 'food'],
      type: 'corporate-safety',
      finding: 'SEC filing data and FDA food enforcement data both available for this entity',
      confidence: 0.6,
    });
  }

  if (secResult && productsResult) {
    correlations.push({
      domains: ['sec', 'products'],
      type: 'corporate-safety',
      finding: 'SEC filing data and CPSC product data both available for this entity',
      confidence: 0.6,
    });
  }

  // Boost confidence when multiple correlations corroborate
  for (const c of correlations) {
    const relatedCorrelations = correlations.filter(
      (other) => other !== c && other.domains.some((d) => c.domains.includes(d)),
    );
    if (relatedCorrelations.length > 0) {
      c.confidence = Math.min(1, c.confidence * (1 + 0.1 * relatedCorrelations.length));
    }
  }

  return correlations;
}

// ─── buildEntityProfile ───

async function buildEntityProfile(entityType, identifier, sourceModules, options = {}) {
  const queryResults = await queryEntity(entityType, identifier, options, sourceModules);
  const correlations = correlate(queryResults);

  // Build cross-domain insights
  const insights = [];
  const conflicts = [];

  // Check for conflicting data across domains
  const okDomains = Object.entries(queryResults.domains)
    .filter(([, v]) => v.status === 'ok' && v.data)
    .map(([k, v]) => ({ domain: k, data: v.data }));

  if (okDomains.length > 1) {
    insights.push({
      type: 'coverage',
      detail: `Data retrieved from ${okDomains.length} of ${Object.keys(queryResults.domains).length} domains`,
    });
  }

  const failedDomains = Object.entries(queryResults.domains)
    .filter(([, v]) => v.status !== 'ok')
    .map(([k, v]) => ({ domain: k, reason: v.status }));

  if (failedDomains.length > 0) {
    insights.push({
      type: 'gaps',
      detail: `${failedDomains.length} domain(s) unavailable: ${failedDomains.map((d) => d.domain).join(', ')}`,
      domains: failedDomains,
    });
  }

  return {
    entityType,
    identifier,
    builtAt: new Date().toISOString(),
    confidence: queryResults.confidence,
    totalMs: queryResults.totalMs,
    domains: queryResults.domains,
    correlations,
    insights,
    conflicts,
    meta: {
      domainsQueried: Object.keys(queryResults.domains).length,
      domainsSucceeded: okDomains.length,
      domainsFailed: failedDomains.length,
      correlationsFound: correlations.length,
    },
  };
}

// ─── Data extraction helpers ───
// These gracefully pull values from varied API response shapes.

function extractViolations(data) {
  if (!data) return 0;
  // water.searchByZip returns array of systems or object with violations
  if (Array.isArray(data)) {
    return data.reduce((sum, sys) => {
      const v = sys.violations || sys.violation_count || 0;
      return sum + (typeof v === 'number' ? v : 0);
    }, 0);
  }
  return data.violations || data.violation_count || 0;
}

function extractCount(data) {
  if (!data) return 0;
  if (Array.isArray(data)) return data.length;
  if (data.results && Array.isArray(data.results)) return data.results.length;
  if (data.total != null) return data.total;
  if (data.count != null) return data.count;
  return 1; // data exists, count as 1
}

function extractMedianIncome(data) {
  if (!data) return null;
  // demographics.getByZip returns object with income fields
  if (data.median_household_income) return data.median_household_income;
  if (data.income) return data.income;
  if (data.medianIncome) return data.medianIncome;
  if (data.data && data.data.median_household_income) return data.data.median_household_income;
  return null;
}

function extractAQI(data) {
  if (!data) return null;
  if (typeof data.aqi === 'number') return data.aqi;
  if (data.AQI != null) return data.AQI;
  if (Array.isArray(data) && data[0]) return data[0].AQI || data[0].aqi || null;
  if (data.data && typeof data.data.aqi === 'number') return data.data.aqi;
  return null;
}

function extractAdverseEventCount(data) {
  if (!data) return 0;
  if (data.meta && data.meta.results && data.meta.results.total) return data.meta.results.total;
  if (data.total != null) return data.total;
  if (Array.isArray(data.results)) return data.results.length;
  return 0;
}

module.exports = { queryEntity, correlate, buildEntityProfile, ENTITY_TYPES };
