function addHints(domain, data) {
  if (!data || typeof data !== 'object') return data;

  switch (domain) {
    case 'drugs': {
      const deaths = data.deaths || 0;
      const total = data.totalReports || 1;
      const ratio = deaths / total;
      data.hints = {
        severity: ratio > 0.05 ? 'high' : ratio > 0.01 ? 'moderate' : 'low',
        context: 'FDA FAERS is voluntary reporting. Estimated 1-10% of adverse events are captured. Actual numbers are likely 10-100x higher.',
        follow_up: [
          `Check /v1/health?q=${encodeURIComponent((data.drug || data.query || '') + ' safety')} for research evidence`,
          `/v1/compare?type=drugs&a=${encodeURIComponent(data.drug || data.query || '')}&b={alternative}`
        ],
        confidence: 0.3
      };
      break;
    }

    case 'water': {
      const violations = data.healthViolations || data.healthViolationCount || 0;
      data.hints = {
        severity: violations >= 3 ? 'high' : violations >= 1 ? 'moderate' : 'low',
        context: 'EPA SDWIS data depends on local testing compliance. Small systems may under-report.',
        follow_up: [
          `/v1/location?zip=${data.zip || data.zipCode || '{zip}'}`
        ],
        confidence: 0.7
      };
      break;
    }

    case 'safety': {
      const score = data.safetyScore || 0;
      const zip = data.zip || data.zipCode || '{zip}';
      data.hints = {
        severity: score < 50 ? 'high' : score <= 75 ? 'moderate' : 'low',
        context: 'Composite score combines water quality (EPA) and hospital quality (CMS). Does not include crime, air quality, or environmental hazards.',
        follow_up: [
          `/v1/demographics?zip=${zip}`,
          `/v1/compare?a=${zip}&b={otherZip}`
        ],
        confidence: 0.6
      };
      break;
    }

    case 'hospitals': {
      const rating = data.overallRating || data.rating || 0;
      data.hints = {
        severity: rating <= 2 ? 'high' : rating <= 3 ? 'moderate' : 'low',
        context: 'CMS star ratings use 1-5 scale. Ratings update annually and lag 6-18 months behind actual performance.',
        follow_up: [
          `/v1/safety?zip=${data.zip || data.zipCode || '{zip}'}`,
          `/v1/compare?type=hospitals&a=${encodeURIComponent(data.name || data.hospitalName || '')}&b={other}`
        ],
        confidence: 0.75
      };
      break;
    }

    case 'food': {
      const classification = (data.classification || '').toLowerCase();
      data.hints = {
        severity: classification.includes('class i') ? 'high' : classification.includes('class ii') ? 'moderate' : 'low',
        context: 'FDA recall data. Class I means reasonable probability of serious health consequences or death. Class II means temporary or reversible. Class III is unlikely to cause harm.',
        follow_up: [
          `/v1/food?brand=${encodeURIComponent(data.brand || data.firm || '')}`,
          `/v1/health?q=${encodeURIComponent((data.reason || data.product || '') + ' risk')}`
        ],
        confidence: 0.85
      };
      break;
    }

    case 'health': {
      const evidenceLevel = data.evidenceLevel || data.evidence || '';
      data.hints = {
        severity: evidenceLevel === 'strong' ? 'high' : evidenceLevel === 'moderate' ? 'moderate' : 'low',
        context: 'Aggregated from PubMed and clinical trial registries. Evidence levels reflect study quality, not health risk.',
        follow_up: [
          `/v1/drugs?q=${encodeURIComponent(data.query || data.term || '')}`,
          `/v1/compare?type=health&a=${encodeURIComponent(data.query || '')}&b={alternative}`
        ],
        confidence: 0.65
      };
      break;
    }

    case 'cars': {
      const complaints = data.complaints || data.complaintCount || 0;
      const recalls = data.recalls || data.recallCount || 0;
      data.hints = {
        severity: recalls > 3 || complaints > 100 ? 'high' : recalls > 1 || complaints > 30 ? 'moderate' : 'low',
        context: 'NHTSA complaint and recall data. Complaint volume correlates with sales volume — popular cars have more complaints regardless of quality.',
        follow_up: [
          `/v1/compare?type=cars&a=${encodeURIComponent(data.make || '')}_${encodeURIComponent(data.model || '')}&b={other}`,
          `/v1/cars?make=${encodeURIComponent(data.make || '')}&year=${(data.year || 0) + 1}`
        ],
        confidence: 0.7
      };
      break;
    }

    case 'flights': {
      const score = data.score || data.reliabilityScore || 50;
      data.hints = {
        severity: score < 40 ? 'high' : score <= 65 ? 'moderate' : 'low',
        context: 'Composite of BTS on-time history, FAA NAS status, and weather. BTS data lags 3-6 months. Real-time signals (FAA, weather) update hourly.',
        follow_up: [
          `/v1/compare?type=flights&a=${encodeURIComponent(data.airline || '')}&b={other}&route=${encodeURIComponent(data.route || '')}`,
          `/v1/flights?origin=${data.origin || '{origin}'}&date=${data.date || '{date}'}`
        ],
        confidence: 0.55
      };
      break;
    }

    default: {
      data.hints = {
        severity: 'unknown',
        context: 'No domain-specific context available for this endpoint.',
        follow_up: [],
        confidence: 0.5
      };
    }
  }

  return data;
}

module.exports = { addHints };
