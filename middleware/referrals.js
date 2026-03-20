const REFERRAL_MAP = {
  crime: { provider: 'FBI UCR', url: 'https://api.usa.gov/crime/fbi/sapi', note: 'Crime statistics by jurisdiction' },
  patents: { provider: 'USPTO', url: 'https://developer.uspto.gov/api-catalog', note: 'Patent and trademark search' },
  education: { provider: 'College Scorecard', url: 'https://collegescorecard.ed.gov/data/api/', note: 'College costs and outcomes' },
  energy: { provider: 'EIA', url: 'https://api.eia.gov/v2/', note: 'Energy production and consumption' },
  earthquakes: { provider: 'USGS', url: 'https://earthquake.usgs.gov/fdsnws/event/1/', note: 'Real-time seismic data' },
  climate: { provider: 'NOAA Climate', url: 'https://www.ncei.noaa.gov/access/services/data/v1', note: 'Historical climate records' },
  trade: { provider: 'UN Comtrade', url: 'https://comtradeapi.un.org/', note: 'International trade data' },
  housing: { provider: 'HUD', url: 'https://data.hud.gov/', note: 'Fair market rents, income limits' },
};

// Additional keyword aliases that map to the same referral domains
const KEYWORD_ALIASES = {
  murder: 'crime', homicide: 'crime', theft: 'crime', robbery: 'crime', assault: 'crime',
  'crime rate': 'crime', violent: 'crime', burglary: 'crime',
  patent: 'patents', trademark: 'patents', intellectual: 'patents', invention: 'patents',
  college: 'education', university: 'education', tuition: 'education', school: 'education',
  'student loan': 'education', graduation: 'education',
  electricity: 'energy', oil: 'energy', gas: 'energy', solar: 'energy', nuclear: 'energy',
  renewable: 'energy', power: 'energy', coal: 'energy',
  earthquake: 'earthquakes', seismic: 'earthquakes', quake: 'earthquakes', tremor: 'earthquakes',
  'climate change': 'climate', 'global warming': 'climate', temperature: 'climate',
  import: 'trade', export: 'trade', tariff: 'trade',
  rent: 'housing', 'fair market': 'housing', 'section 8': 'housing', hud: 'housing',
  mortgage: 'housing', 'housing cost': 'housing',
};

async function searchRegistry(query) {
  // Lazy-load registry search to avoid circular deps
  try {
    const { Redis } = require('@upstash/redis');
    if (!process.env.UPSTASH_REDIS_REST_URL) return [];

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const keys = await redis.keys('registry:*');
    if (keys.length === 0) return [];

    const values = await Promise.all(keys.map(k => redis.get(k)));
    const providers = values
      .map(v => (typeof v === 'string' ? JSON.parse(v) : v))
      .filter(Boolean);

    const lower = query.toLowerCase();
    return providers.filter(p =>
      p.domains.some(d => lower.includes(d.toLowerCase())) ||
      p.name.toLowerCase().includes(lower)
    );
  } catch (err) {
    return [];
  }
}

function getReferral(query) {
  if (!query || typeof query !== 'string') return null;

  const lower = query.toLowerCase();
  const matches = [];

  // Check direct domain keywords
  for (const [domain, ref] of Object.entries(REFERRAL_MAP)) {
    if (lower.includes(domain)) {
      matches.push({
        referred: true,
        provider: ref.provider,
        url: ref.url,
        note: ref.note,
        suggestion: `Try querying ${ref.provider} at ${ref.url}`,
      });
    }
  }

  // Check aliases
  for (const [keyword, domain] of Object.entries(KEYWORD_ALIASES)) {
    if (lower.includes(keyword) && !matches.some(m => m.provider === REFERRAL_MAP[domain].provider)) {
      const ref = REFERRAL_MAP[domain];
      matches.push({
        referred: true,
        provider: ref.provider,
        url: ref.url,
        note: ref.note,
        suggestion: `Try querying ${ref.provider} at ${ref.url}`,
      });
    }
  }

  return matches.length > 0 ? matches : null;
}

async function getReferralWithRegistry(query) {
  const referrals = getReferral(query) || [];
  const registryMatches = await searchRegistry(query);

  const registryReferrals = registryMatches
    .filter(p => p.url !== 'https://api.openprimitive.com')
    .map(p => ({
      referred: true,
      provider: p.name,
      url: p.url,
      note: `Registered provider covering: ${p.domains.join(', ')}`,
      suggestion: `Try querying ${p.name} at ${p.url}`,
      source: 'registry',
    }));

  return [...referrals, ...registryReferrals];
}

module.exports = { getReferral, getReferralWithRegistry, REFERRAL_MAP };
