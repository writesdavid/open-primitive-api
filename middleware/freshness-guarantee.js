/**
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  OPEN PRIMITIVE PROTOCOL — Data Freshness Guarantee Extension      │
 * │                                                                     │
 * │  Proposed OPP spec extension: every response declares how old its  │
 * │  data can be, how old it actually is, and whether the guarantee    │
 * │  holds. No other public API does this today.                       │
 * │                                                                     │
 * │  Headers (added to every /v1/* response):                          │
 * │    X-OPP-Max-Age: 900        — guaranteed max age in seconds       │
 * │    X-OPP-Freshness: 45       — actual age of this response         │
 * │    X-OPP-Guarantee: verified — whether freshness is within bounds  │
 * │                                                                     │
 * │  Body field:                                                        │
 * │    freshness_guarantee: {                                           │
 * │      max_age_seconds: 900,                                          │
 * │      actual_age_seconds: 45,                                        │
 * │      guaranteed: true,                                              │
 * │      note: "This data is at most 15 minutes old"                   │
 * │    }                                                                │
 * │                                                                     │
 * │  Manifest integration: each domain in the OPP manifest should      │
 * │  declare its freshness_guarantee_seconds value. Agents can read    │
 * │  the manifest to know guarantees before making a single request.   │
 * └─────────────────────────────────────────────────────────────────────┘
 */

const { getAge, FRESHNESS_THRESHOLDS } = require('./freshness');

// Max-age guarantees per domain (seconds). These mirror FRESHNESS_THRESHOLDS
// but exist as the authoritative guarantee contract. If a domain's data is
// older than its guarantee, the response says so honestly.
const GUARANTEES = {
  flights: 900,           // 15 minutes
  weather: 1800,          // 30 minutes
  food: 21600,            // 6 hours
  drugs: 21600,           // 6 hours
  water: 86400,           // 24 hours
  hospitals: 86400,       // 24 hours
  health: 3600,           // 1 hour
  nutrition: 86400,       // 24 hours
  jobs: 86400,            // 24 hours
  demographics: 604800,   // 7 days
  products: 21600,        // 6 hours
  sec: 3600,              // 1 hour
  cars: 86400,            // 24 hours
  safety: 86400,          // composite
  location: 86400,        // composite
  compare: 86400,         // composite
  risk: 86400,            // composite
  ask: 0,                 // real-time
};

function humanDuration(seconds) {
  if (seconds === 0) return 'real-time';
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  return `${Math.round(seconds / 86400)} days`;
}

/**
 * Build the freshness guarantee object and headers for a domain.
 * Returns { headers, body } where headers is a plain object and
 * body is the freshness_guarantee field to merge into the response.
 */
function buildGuarantee(domain) {
  const maxAge = GUARANTEES[domain];
  if (maxAge === undefined) return null;

  const actualAge = getAge(domain);
  const guaranteed = actualAge !== null && (maxAge === 0 ? actualAge === 0 : actualAge <= maxAge);

  let note;
  if (actualAge === null) {
    note = 'No fetch recorded yet for this domain. Data freshness cannot be verified.';
  } else if (guaranteed) {
    note = `This data is at most ${humanDuration(maxAge)} old`;
  } else {
    note = `Data may be stale. Last fetch was ${humanDuration(actualAge)} ago, guarantee is ${humanDuration(maxAge)}`;
  }

  const guaranteeStatus = guaranteed ? 'verified' : 'unverified';

  return {
    headers: {
      'X-OPP-Max-Age': String(maxAge),
      'X-OPP-Freshness': actualAge !== null ? String(actualAge) : 'unknown',
      'X-OPP-Guarantee': guaranteeStatus,
    },
    body: {
      max_age_seconds: maxAge,
      actual_age_seconds: actualAge,
      guaranteed,
      note,
    },
  };
}

module.exports = { GUARANTEES, buildGuarantee };
