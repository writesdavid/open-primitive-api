const water = require('./water');
const hospitals = require('./hospitals');
const drugs = require('./drugs');
const food = require('./food');
const cars = require('./cars');
const flights = require('./flights');
const health = require('./health');
const nutrition = require('./nutrition');
const jobs = require('./jobs');
const demographics = require('./demographics');
const products = require('./products');
const sec = require('./sec');
const weather = require('./weather');
const safety = require('./safety');
const compare = require('./compare');

const DOMAIN_KEYWORDS = {
  water: ['water', 'tap', 'drinking', 'contamination', 'epa', 'violation', 'lead in water', 'pfas'],
  hospitals: ['hospital', 'doctor', 'mortality', 'readmission', 'surgery', 'emergency room', 'er '],
  drugs: ['drug', 'medication', 'side effect', 'adverse', 'prescription', 'pharma'],
  food: ['food', 'recall', 'fda', 'contamination', 'allergen', 'foodborne', 'salmonella', 'listeria', 'e. coli'],
  cars: ['car', 'vehicle', 'crash', 'safety rating', 'nhtsa', 'auto recall', 'automobile'],
  flights: ['flight', 'airline', 'delay', 'airport', 'faa', 'flying', 'plane'],
  health: ['health', 'supplement', 'vitamin', 'evidence', 'study', 'clinical trial', 'does .* work'],
  nutrition: ['nutrition', 'calories', 'protein', 'fat', 'carbs', 'diet', 'fiber', 'sodium'],
  jobs: ['job', 'unemployment', 'wage', 'employment', 'salary', 'labor', 'payroll'],
  demographics: ['population', 'income', 'poverty', 'demographics', 'census', 'median income'],
  products: ['product', 'cpsc', 'consumer', 'toy', 'appliance', 'product recall'],
  sec: ['sec', 'filing', 'stock', '10-k', 'earnings', 'quarterly report', 'annual report'],
  weather: ['weather', 'forecast', 'storm', 'temperature', 'alert', 'rain', 'snow', 'wind'],
  safety: ['safe', 'dangerous', 'risk'],
  compare: ['compare', ' vs ', 'versus', 'better', 'worse', 'which is'],
};

function detectDomains(q) {
  const lower = q.toLowerCase();
  const matched = [];

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const kw of keywords) {
      if (kw.includes('.') || kw.includes('*')) {
        if (new RegExp(kw, 'i').test(lower)) { matched.push(domain); break; }
      } else if (lower.includes(kw)) {
        matched.push(domain);
        break;
      }
    }
  }

  // safety needs a ZIP to be useful on its own
  if (matched.includes('safety') && matched.length > 1) {
    const idx = matched.indexOf('safety');
    matched.splice(idx, 1);
  }

  // compare needs two things — keep it only if explicitly comparing
  if (matched.includes('compare') && matched.length > 1) {
    // keep compare alongside the domain being compared
  }

  return matched.length > 0 ? matched : ['unknown'];
}

function extractZip(q) {
  const m = q.match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

function extractZips(q) {
  const matches = q.match(/\b\d{5}\b/g);
  return matches || [];
}

function extractDrugName(q) {
  const lower = q.toLowerCase();
  const patterns = [
    /(?:drug|medication|medicine|prescription)\s+(?:called\s+)?(\w+)/i,
    /(?:side effects?\s+(?:of|for)\s+)(\w+)/i,
    /(?:is\s+)(\w+)\s+(?:safe|dangerous)/i,
  ];
  for (const p of patterns) {
    const m = lower.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractCompanyName(q) {
  const patterns = [
    /(?:company|stock|ticker|shares?\s+of)\s+(\w+)/i,
    /(\b[A-Z]{1,5}\b)\s+(?:stock|filing|10-k|earnings)/,
    /(?:sec|filing)\s+(?:for\s+)?(\w+)/i,
  ];
  for (const p of patterns) {
    const m = q.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractFoodItem(q) {
  const patterns = [
    /(?:calories\s+in|nutrition\s+(?:of|for|in))\s+(.+?)(?:\?|$)/i,
    /(?:how\s+(?:much|many)\s+(?:protein|fat|carbs|calories|fiber|sodium)\s+(?:in|does))\s+(.+?)(?:\s+have)?(?:\?|$)/i,
  ];
  for (const p of patterns) {
    const m = q.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

function extractStateCode(q) {
  const m = q.match(/\b([A-Z]{2})\b/);
  if (m) {
    const valid = [
      'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
      'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
      'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
      'VA','WA','WV','WI','WY','DC',
    ];
    if (valid.includes(m[1])) return m[1];
  }
  return null;
}

function extractAirline(q) {
  const lower = q.toLowerCase();
  const map = {
    delta: 'DL', united: 'UA', american: 'AA', southwest: 'WN',
    alaska: 'AS', jetblue: 'B6', allegiant: 'G4', frontier: 'F9',
  };
  for (const [name, code] of Object.entries(map)) {
    if (lower.includes(name)) return code;
  }
  const m = q.match(/\b(DL|UA|AA|WN|AS|B6|G4|F9)\b/);
  return m ? m[1] : null;
}

function extractCarMakeModel(q) {
  const patterns = [
    /(?:safety|crash|rating)\s+(?:of|for)\s+(?:(?:a|the)\s+)?(\d{4})?\s*(\w+)\s+(\w+)/i,
    /(\d{4})?\s*(\w+)\s+(\w+)\s+(?:safety|crash|rating|recall)/i,
  ];
  for (const p of patterns) {
    const m = q.match(p);
    if (m) return { year: m[1] || null, make: m[2], model: m[3] };
  }
  return null;
}

async function callDomain(domain, question) {
  const zip = extractZip(question);
  const zips = extractZips(question);

  try {
    switch (domain) {
      case 'water': {
        if (!zip) return { domain, error: 'No ZIP code found in question' };
        return await water.searchByZip(zip);
      }
      case 'hospitals': {
        if (!zip) return { domain, error: 'No ZIP code found in question' };
        return await hospitals.searchHospitals(zip);
      }
      case 'drugs': {
        const name = extractDrugName(question);
        if (!name) return { domain, error: 'No drug name found in question' };
        return await drugs.getDrug(name);
      }
      case 'food': {
        const foodItem = extractFoodItem(question);
        return await food.search(foodItem || question);
      }
      case 'cars': {
        const car = extractCarMakeModel(question);
        if (!car) return { domain, error: 'No make/model found in question' };
        return await cars.getSafety(car.make, car.model, car.year);
      }
      case 'flights': {
        const airline = extractAirline(question);
        if (airline) return await flights.getAirline(airline);
        return await flights.getAirlines();
      }
      case 'health': {
        const lower = question.toLowerCase();
        const healthPatterns = [
          /(?:does|is)\s+(\w[\w\s]*?)\s+(?:work|effective|safe|helpful)/i,
          /(?:evidence\s+for|studies?\s+on)\s+(\w[\w\s]*?)(?:\?|$)/i,
        ];
        let term = null;
        for (const p of healthPatterns) {
          const m = lower.match(p);
          if (m) { term = m[1].trim(); break; }
        }
        return await health.searchHealth(term || question);
      }
      case 'nutrition': {
        const item = extractFoodItem(question);
        if (!item) return { domain, error: 'No food item found in question' };
        return await nutrition.searchFood(item);
      }
      case 'jobs': {
        return await jobs.getUnemployment();
      }
      case 'demographics': {
        if (!zip) return { domain, error: 'No ZIP code found in question' };
        return await demographics.getByZip(zip);
      }
      case 'products': {
        return await products.search(question);
      }
      case 'sec': {
        const company = extractCompanyName(question);
        if (!company) return { domain, error: 'No company name found in question' };
        return await sec.searchCompany(company);
      }
      case 'weather': {
        if (zip) return await weather.getForecastByZip(zip);
        return { domain, error: 'No ZIP code or coordinates found in question' };
      }
      case 'safety': {
        if (!zip) return { domain, error: 'No ZIP code found in question' };
        return await safety.getSafetyProfile(zip);
      }
      case 'compare': {
        if (zips.length >= 2) return await compare.compareZips(zips[0], zips[1]);
        return { domain, error: 'Comparison requires two ZIP codes or two items' };
      }
      default:
        return { domain, error: 'Unknown domain' };
    }
  } catch (err) {
    return { domain, error: err.message };
  }
}

function summarize(question, domains, results) {
  const errors = results.filter(r => r.data.error);
  const good = results.filter(r => !r.data.error);

  if (good.length === 0) {
    return `Could not find data to answer: "${question}"`;
  }

  const parts = [];

  for (const r of good) {
    const d = r.data;
    switch (r.domain) {
      case 'water': {
        const count = d.systems ? d.systems.length : 0;
        const violations = d.systems
          ? d.systems.reduce((sum, s) => sum + (s.violations || 0), 0)
          : (d.violations ? d.violations.total : 0);
        if (violations > 0) parts.push(`${count} water system(s) found with ${violations} violation(s)`);
        else parts.push(`${count} water system(s) found with no violations on record`);
        break;
      }
      case 'hospitals': {
        const count = (d.hospitals || d.results || []).length;
        parts.push(`${count} hospital(s) found nearby`);
        break;
      }
      case 'drugs': {
        const name = d.drugName || d.name || 'this drug';
        const events = d.adverseEvents || d.totalEvents;
        if (events) parts.push(`${name} has ${events} reported adverse events on file`);
        else parts.push(`Data retrieved for ${name}`);
        break;
      }
      case 'food': {
        const count = d.total || (d.recalls || d.results || []).length;
        parts.push(`${count} food recall(s) found`);
        break;
      }
      case 'cars': {
        const rating = d.overallRating || d.rating;
        if (rating) parts.push(`Overall safety rating: ${rating}/5 stars`);
        else parts.push('Vehicle safety data retrieved');
        break;
      }
      case 'flights': {
        if (d.airline) parts.push(`${d.airline}: on-time ${d.onTimePercent || 'N/A'}%`);
        else parts.push('Airline data retrieved');
        break;
      }
      case 'health': {
        const evidence = d.evidenceLevel || d.evidence;
        const name = d.supplement || d.query || 'this supplement';
        if (evidence) parts.push(`${name}: evidence level is ${evidence}`);
        else parts.push(`Research data retrieved for ${name}`);
        break;
      }
      case 'nutrition': {
        const foods = d.foods || d.results || [];
        if (foods.length > 0) {
          const first = foods[0];
          const cal = first.calories || first.energy;
          if (cal) parts.push(`${first.name || first.description}: ${cal} calories per serving`);
          else parts.push(`Nutrition data found for ${foods.length} item(s)`);
        }
        break;
      }
      case 'demographics': {
        if (d.population) parts.push(`Population: ${d.population.toLocaleString()}, median income: $${(d.medianIncome || 0).toLocaleString()}`);
        else parts.push('Demographics data retrieved');
        break;
      }
      case 'weather': {
        const periods = d.periods || d.forecast || [];
        if (periods.length > 0) {
          const p = periods[0];
          parts.push(`${p.name || 'Now'}: ${p.shortForecast || p.detailedForecast || ''}, ${p.temperature || ''}${p.temperatureUnit || ''}`);
        } else {
          parts.push('Weather data retrieved');
        }
        break;
      }
      case 'safety': {
        const score = d.safetyScore;
        if (score != null) parts.push(`Safety score: ${score}/100`);
        else parts.push('Safety profile retrieved');
        break;
      }
      default:
        parts.push(`${r.domain} data retrieved`);
    }
  }

  return parts.join('; ') + '.';
}

async function askQuestion(question) {
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return {
      domain: 'ask',
      question: question || '',
      routed_to: [],
      freshness: new Date().toISOString(),
      results: [],
      answer: 'No question provided.',
    };
  }

  const q = question.trim();
  const domains = detectDomains(q);

  const calls = domains.map(async (domain) => {
    const data = await callDomain(domain, q);
    return { domain, data };
  });

  const results = await Promise.all(calls);
  const answer = summarize(q, domains, results);

  return {
    domain: 'ask',
    question: q,
    routed_to: domains,
    freshness: new Date().toISOString(),
    results,
    answer,
  };
}

module.exports = { askQuestion, detectDomains };
