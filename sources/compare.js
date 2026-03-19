const demographics = require('./demographics');
const safety = require('./safety');
const drugs = require('./drugs');
const hospitals = require('./hospitals');

function fmt(n) {
  if (n == null || isNaN(n)) return 'N/A';
  return n.toLocaleString('en-US');
}

async function compareZips(zip1, zip2) {
  const [demo1, demo2, safety1, safety2] = await Promise.all([
    demographics.getByZip(zip1),
    demographics.getByZip(zip2),
    safety.getSafetyProfile(zip1),
    safety.getSafetyProfile(zip2),
  ]);

  if (demo1.error) return { error: `ZIP ${zip1}: ${demo1.error}` };
  if (demo2.error) return { error: `ZIP ${zip2}: ${demo2.error}` };

  const incomeWinner = demo1.medianIncome >= demo2.medianIncome ? zip1 : zip2;
  const incomeLoser = incomeWinner === zip1 ? zip2 : zip1;
  const incomeHigh = Math.max(demo1.medianIncome, demo2.medianIncome);
  const incomeLow = Math.min(demo1.medianIncome, demo2.medianIncome);

  const safetyWinner = (safety1.safetyScore || 0) >= (safety2.safetyScore || 0) ? zip1 : zip2;
  const safetyHigh = Math.max(safety1.safetyScore || 0, safety2.safetyScore || 0);
  const safetyLow = Math.min(safety1.safetyScore || 0, safety2.safetyScore || 0);

  const verdict = `ZIP ${incomeWinner} has higher income ($${fmt(incomeHigh)} vs $${fmt(incomeLow)}) and ${safetyWinner === incomeWinner ? 'better' : `ZIP ${safetyWinner} has better`} safety (${safetyHigh} vs ${safetyLow})`;

  return {
    domain: 'compare',
    type: 'location',
    freshness: new Date().toISOString(),
    a: { zip: zip1, demographics: demo1, safetyScore: safety1.safetyScore || 0 },
    b: { zip: zip2, demographics: demo2, safetyScore: safety2.safetyScore || 0 },
    verdict,
  };
}

async function compareDrugs(drug1, drug2) {
  const [a, b] = await Promise.all([
    drugs.getDrug(drug1),
    drugs.getDrug(drug2),
  ]);

  if (a.error) return { error: `${drug1}: ${a.error}` };
  if (b.error) return { error: `${drug2}: ${b.error}` };

  const topReactionA = a.topReactions && a.topReactions[0] ? a.topReactions[0].reaction : 'none reported';
  const topReactionB = b.topReactions && b.topReactions[0] ? b.topReactions[0].reaction : 'none reported';

  const fewer = a.totalEvents <= b.totalEvents ? drug1 : drug2;
  const low = Math.min(a.totalEvents, b.totalEvents);
  const high = Math.max(a.totalEvents, b.totalEvents);

  return {
    domain: 'compare',
    type: 'drugs',
    freshness: new Date().toISOString(),
    a: { name: drug1, totalEvents: a.totalEvents, seriousEvents: a.seriousEvents, topReaction: topReactionA },
    b: { name: drug2, totalEvents: b.totalEvents, seriousEvents: b.seriousEvents, topReaction: topReactionB },
    verdict: `${fewer} has fewer adverse events (${fmt(low)} vs ${fmt(high)})`,
  };
}

async function compareHospitals(id1, id2) {
  const [a, b] = await Promise.all([
    hospitals.getHospital(id1),
    hospitals.getHospital(id2),
  ]);

  if (a.error) return { error: `${id1}: ${a.error}` };
  if (b.error) return { error: `${id2}: ${b.error}` };

  const ratingA = parseInt(a.overallRating) || 0;
  const ratingB = parseInt(b.overallRating) || 0;

  const better = ratingA >= ratingB ? a : b;
  const worse = ratingA >= ratingB ? b : a;
  const betterRating = Math.max(ratingA, ratingB);
  const worseRating = Math.min(ratingA, ratingB);

  const verdict = betterRating === worseRating
    ? `${a.name} and ${b.name} share the same overall rating (${betterRating}/5)`
    : `${better.name} rates higher (${betterRating}/5 vs ${worseRating}/5)`;

  return {
    domain: 'compare',
    type: 'hospitals',
    freshness: new Date().toISOString(),
    a: { providerId: id1, name: a.name, overallRating: ratingA, city: a.city, state: a.state },
    b: { providerId: id2, name: b.name, overallRating: ratingB, city: b.city, state: b.state },
    verdict,
  };
}

module.exports = { compareZips, compareDrugs, compareHospitals };
