/**
 * Confidence scoring and cross-source corroboration module.
 * Scores data confidence across multiple dimensions and detects
 * agreements/conflicts when multiple sources report the same field.
 */

const SOURCE_RELIABILITY = {
  'fda': 0.95,
  'epa': 0.93,
  'cdc': 0.95,
  'cms': 0.92,
  'nhtsa': 0.94,
  'faa': 0.93,
  'noaa': 0.96,
  'bls': 0.95,
  'census': 0.94,
  'sec': 0.97,
  'cpsc': 0.91,
  'usda': 0.93,
  'nih': 0.95,
  'usgs': 0.96,
  'pbgc': 0.90,
  'fdic': 0.92,
  'hud': 0.88,
  'dol': 0.91,
  'state': 0.80,
  'computed': 0.70,
  'aggregated': 0.75,
};

const FRESHNESS_THRESHOLDS = [
  { days: 1, score: 1.0 },
  { days: 7, score: 0.95 },
  { days: 30, score: 0.85 },
  { days: 90, score: 0.70 },
  { days: 365, score: 0.50 },
];
const FRESHNESS_FLOOR = 0.30;

function clamp(v, lo = 0, hi = 1) {
  return Math.min(hi, Math.max(lo, v));
}

function freshnessScore(updatedAt) {
  if (!updatedAt) return FRESHNESS_FLOOR;
  const age = (Date.now() - new Date(updatedAt).getTime()) / 86400000;
  if (age < 0) return 1.0;
  for (const t of FRESHNESS_THRESHOLDS) {
    if (age < t.days) return t.score;
  }
  return FRESHNESS_FLOOR;
}

function completenessScore(data, expectedFields) {
  if (!expectedFields || expectedFields.length === 0) return 1.0;
  const present = expectedFields.filter(f => data[f] != null).length;
  return present / expectedFields.length;
}

/**
 * Score confidence for a data record.
 *
 * @param {object} data - The data payload.
 * @param {object} metadata
 * @param {string} metadata.source - Source key (e.g. 'fda').
 * @param {string} [metadata.updatedAt] - ISO timestamp of upstream update.
 * @param {string[]} [metadata.expectedFields] - Fields the record should have.
 * @param {number} [metadata.corroboratingCount] - Number of agreeing sources.
 * @param {number} [metadata.conflictCount] - Number of conflicting sources.
 * @returns {{ score: number, dimensions: object }}
 */
function scoreConfidence(data, metadata = {}) {
  const source = (metadata.source || '').toLowerCase();
  const reliability = SOURCE_RELIABILITY[source] ?? 0.60;
  const freshness = freshnessScore(metadata.updatedAt);
  const completeness = completenessScore(data, metadata.expectedFields);

  const corroborating = Math.min(metadata.corroboratingCount || 0, 3);
  const corroboration = clamp(corroborating * 0.1);

  const conflicts = metadata.conflictCount || 0;
  const consistency = clamp(1.0 - conflicts * 0.15);

  const corroborationDim = clamp(corroboration + (consistency - 1.0));

  const raw =
    reliability * 0.35 +
    freshness * 0.25 +
    completeness * 0.20 +
    corroborationDim * 0.20;

  const score = clamp(raw);

  return {
    score: Math.round(score * 1000) / 1000,
    dimensions: {
      sourceReliability: reliability,
      freshness,
      completeness: Math.round(completeness * 1000) / 1000,
      corroboration,
      consistency,
    },
  };
}

/**
 * Cross-source corroboration. Groups claims by field and detects
 * agreements, conflicts, and unique data.
 *
 * @param {Array<{ source: string, field: string, value: * }>} claims
 * @returns {{ agreements: Array, conflicts: Array, unique: Array, corroborationScore: number }}
 */
function corroborate(claims) {
  if (!Array.isArray(claims) || claims.length === 0) {
    return { agreements: [], conflicts: [], unique: [], corroborationScore: 0 };
  }

  const byField = {};
  for (const c of claims) {
    (byField[c.field] ??= []).push(c);
  }

  const agreements = [];
  const conflicts = [];
  const unique = [];

  for (const [field, entries] of Object.entries(byField)) {
    if (entries.length === 1) {
      unique.push(entries[0]);
      continue;
    }

    const canonical = String(entries[0].value).toLowerCase().trim();
    const agreeing = [];
    const conflicting = [];

    for (const e of entries) {
      const norm = String(e.value).toLowerCase().trim();
      if (norm === canonical) {
        agreeing.push(e);
      } else {
        conflicting.push(e);
      }
    }

    if (conflicting.length === 0) {
      agreements.push({ field, sources: agreeing.map(a => a.source), value: entries[0].value });
    } else {
      conflicts.push({
        field,
        values: entries.map(e => ({ source: e.source, value: e.value })),
      });
    }
  }

  const totalFields = Object.keys(byField).length;
  const agreedFields = agreements.length;
  const corroborationScore = totalFields > 0
    ? clamp(Math.round((agreedFields / totalFields) * 1000) / 1000)
    : 0;

  return { agreements, conflicts, unique, corroborationScore };
}

/**
 * Human/agent-readable explanation of a confidence result.
 *
 * @param {object} result - Output of scoreConfidence().
 * @param {object} [meta] - Optional context (source name, corroborating source names).
 * @returns {{ score: number, basis: string }}
 */
function explainConfidence(result, meta = {}) {
  const { score, dimensions } = result;
  const parts = [];

  const src = (meta.source || '').toUpperCase();
  const rel = dimensions.sourceReliability;
  if (rel >= 0.90) {
    parts.push(`High-reliability federal source (${src || 'unknown'}, ${rel})`);
  } else if (rel >= 0.75) {
    parts.push(`Moderate-reliability source (${src || 'unknown'}, ${rel})`);
  } else {
    parts.push(`Lower-reliability source (${src || 'unknown'}, ${rel})`);
  }

  const f = dimensions.freshness;
  if (f >= 0.95) parts.push('data updated within the last week');
  else if (f >= 0.85) parts.push('data updated within the last month');
  else if (f >= 0.70) parts.push('data updated within the last 90 days');
  else if (f >= 0.50) parts.push('data updated within the last year');
  else parts.push('data is over a year old');

  if (meta.corroboratingSources && meta.corroboratingSources.length > 0) {
    parts.push(`${meta.corroboratingSources.length} corroborating source${meta.corroboratingSources.length > 1 ? 's' : ''} (${meta.corroboratingSources.join(', ')})`);
  }

  if (dimensions.completeness < 1.0) {
    const pct = Math.round(dimensions.completeness * 100);
    parts.push(`${pct}% field completeness`);
  }

  if (dimensions.consistency < 1.0) {
    parts.push('conflicts detected with other sources');
  }

  return { score, basis: parts.join(', ') };
}

/**
 * Compliance-oriented scoring. Checks whether the data meets
 * provenance and freshness thresholds for regulatory frameworks.
 *
 * @param {object} data - The data payload.
 * @param {string} jurisdiction - 'eu-ai-act' | 'nist' | 'general'
 * @param {object} [metadata] - Same shape as scoreConfidence metadata, plus:
 * @param {boolean} [metadata.hasProvenanceChain] - Full provenance recorded.
 * @param {boolean} [metadata.hasCryptographicSignature] - Ed25519 or equivalent.
 * @param {boolean} [metadata.hasAuditTrail] - Timestamped audit log exists.
 * @returns {object}
 */
function scoreForCompliance(data, jurisdiction = 'general', metadata = {}) {
  const base = scoreConfidence(data, metadata);

  const hasProvenance = !!metadata.hasProvenanceChain;
  const hasSig = !!metadata.hasCryptographicSignature;
  const hasAudit = !!metadata.hasAuditTrail;
  const fresh = base.dimensions.freshness >= 0.85;

  const meetsEUAIAct = hasProvenance && hasSig && hasAudit && fresh && base.score >= 0.75;
  const meetsNIST = hasProvenance && hasSig && base.score >= 0.70;
  const auditTrailComplete = hasProvenance && hasAudit;

  let complianceScore = base.score;
  if (jurisdiction === 'eu-ai-act' && !meetsEUAIAct) {
    complianceScore = clamp(complianceScore - 0.15);
  }
  if (jurisdiction === 'nist' && !meetsNIST) {
    complianceScore = clamp(complianceScore - 0.10);
  }

  return {
    ...base,
    complianceScore: Math.round(complianceScore * 1000) / 1000,
    jurisdiction,
    meetsEUAIAct,
    meetsNIST,
    auditTrailComplete,
    checks: {
      hasProvenanceChain: hasProvenance,
      hasCryptographicSignature: hasSig,
      hasAuditTrail: hasAudit,
      dataFreshEnough: fresh,
    },
  };
}

module.exports = {
  SOURCE_RELIABILITY,
  scoreConfidence,
  corroborate,
  explainConfidence,
  scoreForCompliance,
};
