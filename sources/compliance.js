const crypto = require('crypto');

/**
 * Regulatory compliance metadata module.
 * Tags API responses with jurisdiction compliance scores, license info,
 * PII detection results, and audit records so model providers can prove
 * which data informed their outputs.
 */

/* ------------------------------------------------------------------ */
/*  Jurisdiction compliance profiles                                   */
/* ------------------------------------------------------------------ */

const JURISDICTIONS = {
  'eu-ai-act': {
    name: 'EU AI Act (Regulation 2024/1689)',
    effectiveDate: '2026-08-02',
    requirements: {
      provenanceChain: true,
      signedResponses: true,
      freshnessThreshold: 90,
      auditTrail: true,
      humanOversight: true,
      biasAssessment: false,
      transparencyReport: true,
    },
  },
  'nist-ai-rmf': {
    name: 'NIST AI Risk Management Framework',
    requirements: {
      provenanceChain: true,
      signedResponses: true,
      freshnessThreshold: 180,
      auditTrail: true,
      humanOversight: false,
      biasAssessment: false,
      transparencyReport: false,
    },
  },
  'eo-14110': {
    name: 'US Executive Order 14110 (Safe AI)',
    requirements: {
      provenanceChain: true,
      signedResponses: true,
      freshnessThreshold: 365,
      auditTrail: true,
      humanOversight: false,
      biasAssessment: false,
      transparencyReport: false,
    },
  },
  'canada-aida': {
    name: 'Canada Artificial Intelligence and Data Act',
    requirements: {
      provenanceChain: true,
      signedResponses: false,
      freshnessThreshold: 180,
      auditTrail: true,
      humanOversight: true,
      biasAssessment: true,
      transparencyReport: false,
    },
  },
};

/* ------------------------------------------------------------------ */
/*  Data license classification                                        */
/* ------------------------------------------------------------------ */

const DATA_LICENSES = {
  'us-federal': {
    type: 'public-domain',
    trainingAllowed: true,
    redistributionAllowed: true,
    attributionRequired: false,
    commercialUse: true,
    piiRisk: 'low',
    retentionPeriod: null,
  },
  'us-state': {
    type: 'varies',
    trainingAllowed: true,
    redistributionAllowed: true,
    attributionRequired: true,
    commercialUse: true,
    piiRisk: 'medium',
    retentionPeriod: '7 years',
  },
  'us-municipal': {
    type: 'public-record',
    trainingAllowed: true,
    redistributionAllowed: true,
    attributionRequired: true,
    commercialUse: true,
    piiRisk: 'medium',
    retentionPeriod: '5 years',
  },
  'open-data': {
    type: 'open-license',
    trainingAllowed: true,
    redistributionAllowed: true,
    attributionRequired: true,
    commercialUse: true,
    piiRisk: 'low',
    retentionPeriod: null,
  },
  'restricted': {
    type: 'restricted',
    trainingAllowed: false,
    redistributionAllowed: false,
    attributionRequired: true,
    commercialUse: false,
    piiRisk: 'high',
    retentionPeriod: '1 year',
  },
};

/* ------------------------------------------------------------------ */
/*  Domain-to-license mapping                                          */
/* ------------------------------------------------------------------ */

const DOMAIN_LICENSE = {
  flights: 'us-federal',
  cars: 'us-federal',
  food: 'us-federal',
  water: 'us-federal',
  drugs: 'us-federal',
  hospitals: 'us-federal',
  health: 'us-federal',
  nutrition: 'us-federal',
  jobs: 'us-federal',
  demographics: 'us-federal',
  products: 'us-federal',
  sec: 'us-federal',
  weather: 'us-federal',
  air: 'us-federal',
  alerts: 'us-federal',
  earthquakes: 'us-federal',
  spending: 'us-federal',
  safety: 'us-federal',
  meat: 'us-federal',
  'clinical-trials': 'us-federal',
  dailymed: 'us-federal',
  'drug-interactions': 'us-federal',
  eligible: 'us-federal',
  risk: 'us-federal',
  location: 'us-federal',
  reclaim: 'us-state',
};

/* ------------------------------------------------------------------ */
/*  PII detection patterns                                             */
/* ------------------------------------------------------------------ */

const PII_PATTERNS = [
  { field: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/, risk: 'high' },
  { field: 'ssn', pattern: /\b\d{9}\b/, risk: 'high' },
  { field: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, risk: 'medium' },
  { field: 'phone', pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/, risk: 'medium' },
  { field: 'address', pattern: /\b\d{1,5}\s+[A-Z][a-zA-Z]+\s+(?:St|Ave|Blvd|Dr|Ln|Rd|Way|Ct|Pl)\b/i, risk: 'medium' },
  { field: 'zipCode', pattern: /\b\d{5}(?:-\d{4})?\b/, risk: 'low' },
];

const PII_FIELD_NAMES = [
  'name', 'ownerName', 'owner_name', 'firstName', 'first_name',
  'lastName', 'last_name', 'fullName', 'full_name', 'address',
  'streetAddress', 'street_address', 'city', 'state', 'zip',
  'zipCode', 'zip_code', 'email', 'phone', 'ssn', 'dob',
  'dateOfBirth', 'date_of_birth', 'birthDate', 'birth_date',
];

/* ------------------------------------------------------------------ */
/*  detectPII                                                          */
/* ------------------------------------------------------------------ */

function detectPII(data) {
  const found = new Set();
  let maxRisk = 'none';
  const riskOrder = { none: 0, low: 1, medium: 2, high: 3 };

  const text = typeof data === 'string' ? data : JSON.stringify(data);

  // Pattern matching on values
  for (const { field, pattern, risk } of PII_PATTERNS) {
    if (pattern.test(text)) {
      found.add(field);
      if (riskOrder[risk] > riskOrder[maxRisk]) maxRisk = risk;
    }
  }

  // Field name matching on keys
  if (typeof data === 'object' && data !== null) {
    const keys = collectKeys(data);
    for (const key of keys) {
      const lower = key.toLowerCase();
      for (const piiField of PII_FIELD_NAMES) {
        if (lower === piiField.toLowerCase() || lower.includes(piiField.toLowerCase())) {
          found.add(key);
          if (riskOrder.medium > riskOrder[maxRisk]) maxRisk = 'medium';
        }
      }
    }
  }

  return {
    piiPresent: found.size > 0,
    fields: Array.from(found),
    risk: maxRisk,
  };
}

function collectKeys(obj, prefix = '', result = new Set()) {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) collectKeys(item, prefix, result);
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const key of Object.keys(obj)) {
      result.add(key);
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        collectKeys(obj[key], key, result);
      }
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  assessCompliance                                                   */
/* ------------------------------------------------------------------ */

function assessCompliance(response, jurisdiction) {
  const profile = JURISDICTIONS[jurisdiction];
  if (!profile) return { error: `Unknown jurisdiction: ${jurisdiction}` };

  const reqs = profile.requirements;
  const results = {};
  const gaps = [];
  let passed = 0;
  let total = 0;

  const meta = response?.opp || response?.meta || response || {};
  const provenance = meta.provenance || meta.sources || null;
  const signature = meta.signature || meta.signed || null;
  const freshness = meta.freshness || meta.dataAge || null;
  const hasAudit = !!(meta.requestId || meta.audit);

  // Provenance chain
  if (reqs.provenanceChain) {
    total++;
    const ok = !!provenance;
    results.provenanceChain = ok;
    if (ok) passed++;
    else gaps.push({ requirement: 'provenanceChain', remediation: 'Add provenance tracking via provenance.js to trace data to origin source.' });
  }

  // Signed responses
  if (reqs.signedResponses) {
    total++;
    const ok = !!signature;
    results.signedResponses = ok;
    if (ok) passed++;
    else gaps.push({ requirement: 'signedResponses', remediation: 'Enable Ed25519 response signing in OPP envelope.' });
  }

  // Freshness threshold
  if (reqs.freshnessThreshold) {
    total++;
    let ok = true;
    if (freshness && typeof freshness === 'object' && freshness.ageDays != null) {
      ok = freshness.ageDays <= reqs.freshnessThreshold;
    } else if (typeof freshness === 'number') {
      ok = freshness <= reqs.freshnessThreshold;
    }
    results.freshnessThreshold = ok;
    if (ok) passed++;
    else gaps.push({ requirement: 'freshnessThreshold', remediation: `Data must be less than ${reqs.freshnessThreshold} days old. Refresh source data.` });
  }

  // Audit trail
  if (reqs.auditTrail) {
    total++;
    const ok = hasAudit;
    results.auditTrail = ok;
    if (ok) passed++;
    else gaps.push({ requirement: 'auditTrail', remediation: 'Generate audit record via generateAuditRecord() for every request.' });
  }

  // Human oversight
  if (reqs.humanOversight) {
    total++;
    const ok = !!(meta.humanOversight || meta.humanReviewFlag);
    results.humanOversight = ok;
    if (ok) passed++;
    else gaps.push({ requirement: 'humanOversight', remediation: 'Add humanOversight flag to indicate when human review is needed.' });
  }

  // Bias assessment
  if (reqs.biasAssessment) {
    total++;
    const ok = !!(meta.biasAssessment);
    results.biasAssessment = ok;
    if (ok) passed++;
    else gaps.push({ requirement: 'biasAssessment', remediation: 'Include bias assessment metadata for data selection methodology.' });
  }

  // Transparency report
  if (reqs.transparencyReport) {
    total++;
    const ok = !!(meta.transparencyReport || meta.sourceDisclosure);
    results.transparencyReport = ok;
    if (ok) passed++;
    else gaps.push({ requirement: 'transparencyReport', remediation: 'Publish data sourcing transparency report and link it in responses.' });
  }

  const score = total > 0 ? Math.round((passed / total) * 100) / 100 : 1.0;

  return {
    jurisdiction,
    name: profile.name,
    meets: gaps.length === 0,
    score,
    results,
    gaps,
  };
}

/* ------------------------------------------------------------------ */
/*  tagCompliance                                                      */
/* ------------------------------------------------------------------ */

function tagCompliance(responseData, metadata = {}) {
  const domain = metadata.domain || 'unknown';
  const licenseKey = DOMAIN_LICENSE[domain] || 'us-federal';
  const license = DATA_LICENSES[licenseKey] || DATA_LICENSES['us-federal'];

  // PII scan
  const pii = detectPII(responseData);

  // Assess all jurisdictions
  const jurisdictions = {};
  for (const [key, _profile] of Object.entries(JURISDICTIONS)) {
    const assessment = assessCompliance(responseData, key);
    jurisdictions[key] = {
      meets: assessment.meets,
      gaps: assessment.gaps.map(g => g.requirement),
      score: assessment.score,
    };
  }

  // Build audit block
  const requestId = metadata.requestId || crypto.randomUUID();
  const audit = {
    requestId,
    timestamp: new Date().toISOString(),
    dataVersion: metadata.dataVersion || metadata.version || null,
    provenanceComplete: !!(responseData?.opp?.provenance || responseData?.meta?.provenance || responseData?.meta?.sources),
    signaturePresent: !!(responseData?.opp?.signature || responseData?.meta?.signature || responseData?.meta?.signed),
  };

  // Retention recommendation
  const retention = resolveRetention(licenseKey);

  return {
    compliance: {
      jurisdictions,
      license: {
        type: license.type,
        trainingAllowed: license.trainingAllowed,
        redistributionAllowed: license.redistributionAllowed,
        commercialUse: license.commercialUse,
        piiPresent: pii.piiPresent,
        piiFields: pii.fields,
      },
      audit,
      retention,
    },
  };
}

function resolveRetention(licenseKey) {
  const license = DATA_LICENSES[licenseKey];
  if (licenseKey === 'us-state' || license?.retentionPeriod) {
    return {
      recommended: license.retentionPeriod || '7 years',
      basis: 'EU AI Act Article 12 — record-keeping for high-risk AI systems',
    };
  }
  return {
    recommended: '7 years',
    basis: 'EU AI Act Article 12 — record-keeping for high-risk AI systems',
  };
}

/* ------------------------------------------------------------------ */
/*  generateAuditRecord                                                */
/* ------------------------------------------------------------------ */

async function generateAuditRecord(requestId, domain, query, responseHash, agentId, env) {
  const record = {
    requestId,
    domain,
    query: typeof query === 'string' ? query : JSON.stringify(query),
    responseHash,
    agentId: agentId || 'anonymous',
    timestamp: new Date().toISOString(),
    version: '1.0',
  };

  const key = `audit:${domain}:${requestId}`;

  // Store in Redis (Upstash via env) if available
  if (env?.UPSTASH_REDIS_REST_URL && env?.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const ttl = 7 * 365 * 24 * 60 * 60; // 7 years in seconds
      const url = `${env.UPSTASH_REDIS_REST_URL}/SET/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(record))}/EX/${ttl}`;
      await fetch(url, {
        headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
      });
    } catch (_e) {
      // Audit storage failure is non-fatal; the record is still returned
    }
  }

  return { key, record };
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

module.exports = {
  JURISDICTIONS,
  DATA_LICENSES,
  DOMAIN_LICENSE,
  PII_PATTERNS,
  PII_FIELD_NAMES,
  tagCompliance,
  assessCompliance,
  detectPII,
  generateAuditRecord,
};
