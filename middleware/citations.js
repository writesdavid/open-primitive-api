// Citation middleware — makes every /v1/* response agent-quotable
// Intercepts res.json() to append a `citations` block with a pre-formatted statement

const DOMAIN_TEMPLATES = {
  drugs: (data) => {
    const drug = data.drug || data.query || 'unknown';
    const total = data.totalEvents || data.total || 0;
    const top = (data.topReactions && data.topReactions[0] && data.topReactions[0].reaction) || 'unknown';
    return {
      statement: `According to FDA FAERS, ${drug} has ${total} reported adverse events, with ${top} as the most common`,
      source_name: 'FDA FAERS',
      source_url: 'https://api.fda.gov',
      license: 'US Government Public Domain',
    };
  },
  food: (data) => {
    const total = data.total || (data.recalls && data.recalls.length) || 0;
    return {
      statement: `According to FDA Enforcement, ${total} food recalls are currently active`,
      source_name: 'FDA Enforcement',
      source_url: 'https://api.fda.gov',
      license: 'US Government Public Domain',
    };
  },
  water: (data) => {
    const count = data.count || (data.systems && data.systems.length) || 0;
    const zip = data.zip || 'unknown';
    return {
      statement: `According to EPA SDWIS, ${count} water systems serve ZIP ${zip}`,
      source_name: 'EPA SDWIS',
      source_url: 'https://www.epa.gov/enviro/sdwis-search',
      license: 'US Government Public Domain',
    };
  },
  hospitals: (data) => {
    const count = data.count || (data.hospitals && data.hospitals.length) || 0;
    const query = data.query || data.q || 'the search area';
    return {
      statement: `According to CMS Care Compare, ${count} hospitals found for ${query}`,
      source_name: 'CMS Care Compare',
      source_url: 'https://data.cms.gov',
      license: 'US Government Public Domain',
    };
  },
  health: (data) => {
    const totalStudies = data.totalStudies || data.total || 0;
    const query = data.query || 'unknown';
    const evidence = data.evidence || data.evidenceLevel || 'unrated';
    return {
      statement: `According to PubMed, ${totalStudies} studies found for ${query}, evidence level: ${evidence}`,
      source_name: 'PubMed/MEDLINE',
      source_url: 'https://pubmed.ncbi.nlm.nih.gov',
      license: 'US Government Public Domain',
    };
  },
  safety: (data) => {
    const zip = data.zip || 'unknown';
    const score = data.safetyScore || data.score || 'N/A';
    return {
      statement: `According to EPA and CMS data, ZIP ${zip} has a safety score of ${score}/100`,
      source_name: 'EPA + CMS',
      source_url: 'https://www.epa.gov',
      license: 'US Government Public Domain',
    };
  },
  cars: (data) => {
    const count = data.recallCount || (data.recalls && data.recalls.length) || 0;
    const year = data.year || '';
    const make = data.make || '';
    const model = data.model || '';
    return {
      statement: `According to NHTSA, ${count} recalls found for ${year} ${make} ${model}`.trim(),
      source_name: 'NHTSA',
      source_url: 'https://api.nhtsa.gov',
      license: 'US Government Public Domain',
    };
  },
  flights: (data) => {
    const count = (data.airlines && data.airlines.length) || 1;
    return {
      statement: `According to FAA, ${count} airlines reporting delays`,
      source_name: 'FAA NAS',
      source_url: 'https://nasstatus.faa.gov',
      license: 'US Government Public Domain',
    };
  },
  nutrition: (data) => {
    const query = data.query || data.description || 'unknown';
    const calories = data.calories || (data.nutrients && data.nutrients.calories) || 'N/A';
    return {
      statement: `According to USDA, ${query} contains ${calories} calories per serving`,
      source_name: 'USDA FoodData Central',
      source_url: 'https://fdc.nal.usda.gov',
      license: 'US Government Public Domain',
    };
  },
  jobs: (data) => {
    const value = data.value || data.rate || 'N/A';
    return {
      statement: `According to BLS, current unemployment rate is ${value}%`,
      source_name: 'Bureau of Labor Statistics',
      source_url: 'https://api.bls.gov',
      license: 'US Government Public Domain',
    };
  },
  demographics: (data) => {
    const zip = data.zip || 'unknown';
    const pop = data.population || 'N/A';
    const income = data.medianIncome || data.median_income || 'N/A';
    return {
      statement: `According to US Census, ZIP ${zip} has population ${pop}, median income $${income}`,
      source_name: 'US Census ACS',
      source_url: 'https://api.census.gov',
      license: 'US Government Public Domain',
    };
  },
  products: (data) => {
    const total = data.total || (data.recalls && data.recalls.length) || 0;
    return {
      statement: `According to CPSC, ${total} product recalls in the last 90 days`,
      source_name: 'CPSC',
      source_url: 'https://www.saferproducts.gov',
      license: 'US Government Public Domain',
    };
  },
  sec: (data) => {
    const count = data.count || (data.filings && data.filings.length) || 0;
    const query = data.query || data.company || 'unknown';
    return {
      statement: `According to SEC EDGAR, ${count} filings found for ${query}`,
      source_name: 'SEC EDGAR',
      source_url: 'https://efts.sec.gov',
      license: 'US Government Public Domain',
    };
  },
};

function getDomainFromPath(path) {
  // /v1/drugs?name=aspirin -> drugs
  const match = path.match(/^\/v1\/([a-z]+)/);
  return match ? match[1] : null;
}

function citationMiddleware(req, res, next) {
  // Only intercept /v1/* routes
  if (!req.path.startsWith('/v1/')) return next();

  const domain = getDomainFromPath(req.path);
  const originalJson = res.json.bind(res);

  res.json = function(body) {
    // Skip if error response or no template for this domain
    if (!body || body.error || !domain || !DOMAIN_TEMPLATES[domain]) {
      return originalJson(body);
    }

    const template = DOMAIN_TEMPLATES[domain];
    try {
      const citation = template(body);
      const fullUrl = 'https://api.openprimitive.com' + req.originalUrl;

      body.citations = {
        statement: citation.statement,
        source_name: citation.source_name,
        source_url: citation.source_url,
        accessed: new Date().toISOString(),
        api_url: fullUrl,
        license: citation.license,
      };
    } catch (e) {
      // Citation generation failed — send response without it
    }

    return originalJson(body);
  };

  next();
}

module.exports = { citationMiddleware };
