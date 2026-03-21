// Benefits eligibility checker — federal program thresholds, no external API calls
// Sources: HHS Poverty Guidelines, CMS, IRS, HUD

// 2026 Federal Poverty Level guidelines (48 contiguous states + DC)
const FPL_BASE = 15650;
const FPL_PER_PERSON = 5580;
// Alaska and Hawaii have higher FPLs
const FPL_ALASKA_BASE = 19560;
const FPL_ALASKA_PER_PERSON = 6980;
const FPL_HAWAII_BASE = 18000;
const FPL_HAWAII_PER_PERSON = 6420;

const MEDICAID_EXPANSION_STATES = new Set([
  'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'HI', 'IL', 'IN', 'IA',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MT', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'VT',
  'VA', 'WA', 'WV', 'DC',
]);

// EITC 2025 thresholds (single filer)
const EITC_THRESHOLDS = [
  { children: 0, incomeLimit: 17640, maxCredit: 632 },
  { children: 1, incomeLimit: 46560, maxCredit: 4213 },
  { children: 2, incomeLimit: 52918, maxCredit: 6960 },
  { children: 3, incomeLimit: 56838, maxCredit: 7830 },
];

// CHIP: state-level FPL thresholds (percentage of FPL)
// Using representative values; most states fall between 200-300% FPL
const CHIP_STATE_THRESHOLDS = {
  AL: 317, AK: 208, AZ: 200, AR: 211, CA: 266, CO: 260, CT: 323,
  DE: 212, DC: 324, FL: 210, GA: 247, HI: 308, ID: 185, IL: 318,
  IN: 258, IA: 302, KS: 244, KY: 213, LA: 255, ME: 208, MD: 317,
  MA: 300, MI: 212, MN: 275, MS: 209, MO: 305, MT: 261, NE: 213,
  NV: 200, NH: 318, NJ: 355, NM: 300, NY: 405, NC: 211, ND: 175,
  OH: 206, OK: 210, OR: 305, PA: 314, RI: 261, SC: 208, SD: 209,
  TN: 250, TX: 201, UT: 200, VT: 317, VA: 205, WA: 317, WV: 300,
  WI: 301, WY: 200,
};

function getFPL(householdSize, state) {
  const s = (state || '').toUpperCase();
  let base, perPerson;
  if (s === 'AK') {
    base = FPL_ALASKA_BASE;
    perPerson = FPL_ALASKA_PER_PERSON;
  } else if (s === 'HI') {
    base = FPL_HAWAII_BASE;
    perPerson = FPL_HAWAII_PER_PERSON;
  } else {
    base = FPL_BASE;
    perPerson = FPL_PER_PERSON;
  }
  return base + perPerson * Math.max(0, householdSize - 1);
}

function fmt(n) {
  return '$' + n.toLocaleString('en-US');
}

function checkSNAP(income, householdSize, state, fpl) {
  const threshold = Math.round(fpl * 1.3);
  const eligible = income <= threshold;
  return {
    name: 'SNAP',
    eligible,
    confidence: eligible ? 0.85 : 0.90,
    note: `Income ${fmt(income)} is ${eligible ? 'below' : 'above'} 130% FPL (${fmt(threshold)}) for household of ${householdSize}`,
    source: 'HHS Poverty Guidelines 2026',
  };
}

function checkMedicaid(income, householdSize, state, fpl) {
  const s = (state || '').toUpperCase();
  const isExpansion = MEDICAID_EXPANSION_STATES.has(s);

  if (isExpansion) {
    const threshold = Math.round(fpl * 1.38);
    const eligible = income <= threshold;
    return {
      name: 'Medicaid',
      eligible,
      confidence: eligible ? 0.80 : 0.85,
      note: `${s} is an expansion state. Income ${fmt(income)} is ${eligible ? 'below' : 'above'} 138% FPL (${fmt(threshold)})`,
      source: 'CMS',
    };
  }

  // Non-expansion: generally 100% FPL for parents, no coverage for childless adults
  const threshold = fpl;
  const maybeEligible = income <= threshold;
  return {
    name: 'Medicaid',
    eligible: maybeEligible,
    confidence: 0.50,
    note: `${s} is not an expansion state. Eligibility depends on categorical requirements (parent, pregnant, disabled). Income ${fmt(income)} vs 100% FPL (${fmt(threshold)})`,
    source: 'CMS',
  };
}

function checkEITC(income, householdSize) {
  // Estimate qualifying children from household size (household - 1 adult)
  const estChildren = Math.max(0, householdSize - 1);
  const bracket = EITC_THRESHOLDS[Math.min(estChildren, 3)];
  const eligible = income < bracket.incomeLimit;

  return {
    name: 'EITC',
    eligible,
    confidence: eligible ? 0.75 : 0.85,
    estimatedCredit: eligible ? fmt(bracket.maxCredit) : '$0',
    note: eligible
      ? `Estimated based on ${estChildren} qualifying child${estChildren !== 1 ? 'ren' : ''} assumption. Income ${fmt(income)} is below ${fmt(bracket.incomeLimit)} threshold. Max credit ${fmt(bracket.maxCredit)}.`
      : `Income ${fmt(income)} exceeds ${fmt(bracket.incomeLimit)} threshold for ${estChildren} child${estChildren !== 1 ? 'ren' : ''}`,
    source: 'IRS',
  };
}

function checkCHIP(income, householdSize, state, fpl) {
  const s = (state || '').toUpperCase();
  const pct = CHIP_STATE_THRESHOLDS[s] || 200;
  const threshold = Math.round(fpl * (pct / 100));
  const eligible = income <= threshold;
  const hasChildren = householdSize > 1;

  return {
    name: 'CHIP',
    eligible: eligible && hasChildren,
    confidence: hasChildren ? (eligible ? 0.75 : 0.85) : 0.40,
    note: hasChildren
      ? `${s} CHIP covers children in families up to ${pct}% FPL (${fmt(threshold)}). Income ${fmt(income)} is ${eligible ? 'below' : 'above'} threshold.`
      : 'CHIP covers children only. Household size of 1 suggests no qualifying children.',
    source: 'CMS',
  };
}

function checkLIHEAP(income, householdSize, state, fpl) {
  const threshold = Math.round(fpl * 1.5);
  const eligible = income <= threshold;

  return {
    name: 'LIHEAP',
    eligible,
    confidence: eligible ? 0.70 : 0.85,
    note: `Income ${fmt(income)} is ${eligible ? 'below' : 'above'} 150% FPL (${fmt(threshold)}). Actual eligibility may also use 60% state median income test.`,
    source: 'HHS',
  };
}

async function checkEligibility(query) {
  const income = parseInt(query.income, 10);
  const household = parseInt(query.household, 10);
  const state = (query.state || '').toUpperCase();

  if (!income || isNaN(income)) return { error: 'income parameter required (annual, e.g. 45000)' };
  if (!household || isNaN(household) || household < 1) return { error: 'household parameter required (number of people, e.g. 3)' };
  if (!state || state.length !== 2) return { error: 'state parameter required (2-letter code, e.g. TX)' };

  const fpl = getFPL(household, state);

  const programs = [
    checkSNAP(income, household, state, fpl),
    checkMedicaid(income, household, state, fpl),
    checkEITC(income, household),
    checkCHIP(income, household, state, fpl),
    checkLIHEAP(income, household, state, fpl),
  ];

  const eligiblePrograms = programs.filter(p => p.eligible);
  const eligibleCount = eligiblePrograms.length;

  // Rough annual benefit estimate
  let totalEstimate = 0;
  eligiblePrograms.forEach(p => {
    if (p.name === 'SNAP') totalEstimate += Math.round(Math.max(0, (fpl * 1.3 - income) * 0.3) / 12) * 12 || 2400;
    if (p.name === 'EITC' && p.estimatedCredit) totalEstimate += parseInt(p.estimatedCredit.replace(/[$,]/g, ''), 10) || 0;
    if (p.name === 'Medicaid') totalEstimate += 7200; // avg annual value
    if (p.name === 'CHIP') totalEstimate += 3600; // avg annual value per child
    if (p.name === 'LIHEAP') totalEstimate += 800; // avg annual benefit
  });

  return {
    domain: 'eligible',
    source: 'HHS, CMS, IRS, HUD',
    freshness: new Date().toISOString(),
    income,
    household,
    state,
    fpl,
    programs,
    totalEstimatedBenefits: fmt(totalEstimate) + '/year',
    summary: `Based on income ${fmt(income)} and household size ${household} in ${state}, you may qualify for ${eligibleCount} federal program${eligibleCount !== 1 ? 's' : ''} worth approximately ${fmt(totalEstimate)} per year.`,
    disclaimer: 'These are estimates based on federal guidelines. Actual eligibility depends on additional factors including assets, immigration status, work requirements, and state-specific rules. Not legal or financial advice.',
  };
}

module.exports = { checkEligibility };
