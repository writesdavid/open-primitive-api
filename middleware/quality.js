const QUALITY_GRADES = {
  flights: { completeness: 0.85, freshness: 'real-time', reportingRate: 'mandatory', reliability: 'high', note: 'FAA data is mandatory reporting. Weather forecasts are 4-day projections.' },
  cars: { completeness: 0.95, freshness: 'continuous', reportingRate: 'mandatory', reliability: 'high', note: 'NHTSA crash tests cover most popular models. Recalls are mandatory.' },
  food: { completeness: 0.90, freshness: 'continuous', reportingRate: 'mandatory', reliability: 'high', note: 'FDA enforcement is mandatory. Voluntary recalls may be delayed.' },
  water: { completeness: 0.70, freshness: 'quarterly', reportingRate: 'mandatory but delayed', reliability: 'moderate', note: 'EPA SDWIS depends on local utility testing compliance. Small systems under-report.' },
  drugs: { completeness: 0.10, freshness: 'quarterly', reportingRate: 'voluntary', reliability: 'low-moderate', note: 'FDA FAERS captures estimated 1-10% of adverse events. Voluntary reporting creates severe undercounting.' },
  hospitals: { completeness: 0.85, freshness: 'monthly', reportingRate: 'mandatory', reliability: 'high', note: 'CMS data covers Medicare-participating hospitals. Non-participating facilities excluded.' },
  health: { completeness: 0.95, freshness: 'daily', reportingRate: 'n/a', reliability: 'high', note: 'PubMed indexes 35M+ citations. Study count indicates research volume, not efficacy.' },
  nutrition: { completeness: 0.90, freshness: 'periodic', reportingRate: 'curated', reliability: 'high', note: 'USDA maintains gold-standard nutrient database. Branded food data from manufacturers.' },
  jobs: { completeness: 0.95, freshness: 'monthly', reportingRate: 'mandatory', reliability: 'very high', note: 'BLS data is survey-based with rigorous methodology. Revised after initial release.' },
  demographics: { completeness: 0.90, freshness: 'annual', reportingRate: 'survey', reliability: 'high', note: 'ACS 5-year estimates. Margins of error increase for smaller geographies.' },
  products: { completeness: 0.80, freshness: 'continuous', reportingRate: 'mandatory', reliability: 'high', note: 'CPSC recalls are mandatory. Some categories under-reported.' },
  sec: { completeness: 0.99, freshness: 'real-time', reportingRate: 'mandatory', reliability: 'very high', note: 'SEC filings are legally mandated. XBRL data may have minor tagging inconsistencies.' },
};

function addQualityGrade(domain, responseData) {
  const grade = QUALITY_GRADES[domain];
  if (grade) {
    responseData.dataQuality = { domain, ...grade };
  }
  return responseData;
}

module.exports = { addQualityGrade, QUALITY_GRADES };
