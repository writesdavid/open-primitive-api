/**
 * negotiation.js — Negotiation layer (Layer 5) for Open Primitive Protocol
 *
 * A negotiation is how an agent bargains with a service on behalf of an
 * individual. The agent submits an intent, the service responds with terms,
 * and the agent evaluates, accepts, counters, or rejects.
 *
 * Sits above the intent layer. Every negotiation references an intent.
 *
 * Redis keys:
 *   negotiation:{negotiationId}         — hash of negotiation object
 *   negotiations:agent:{agentId}        — sorted set of negotiationIds by creation time
 */

const { Redis } = require('@upstash/redis');

// ---------------------------------------------------------------------------
// Redis client
// ---------------------------------------------------------------------------

let _redis = null;
function getRedis(env) {
  if (_redis) return _redis;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
  _redis = new Redis({ url, token });
  return _redis;
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateNegotiationId() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `opp_n_${ts}${rand}`;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['proposed', 'terms_offered', 'countered', 'accepted', 'rejected', 'expired'];

const VALID_COST_MODELS = ['per-call', 'subscription', 'free'];

function validateTerms(terms) {
  if (!terms) throw new Error('terms is required');
  if (!terms.description) throw new Error('terms.description is required');
  if (terms.cost) {
    if (typeof terms.cost.amount !== 'number') throw new Error('terms.cost.amount must be a number');
    if (!terms.cost.currency) throw new Error('terms.cost.currency is required');
    if (!VALID_COST_MODELS.includes(terms.cost.model)) {
      throw new Error('terms.cost.model must be one of: ' + VALID_COST_MODELS.join(', '));
    }
  }
  if (typeof terms.confidence !== 'number' || terms.confidence < 0 || terms.confidence > 1) {
    throw new Error('terms.confidence must be a number between 0 and 1');
  }
  if (!terms.expiresAt) throw new Error('terms.expiresAt is required');
}

function validateCounter(counter) {
  if (!counter) throw new Error('counter is required');
  if (counter.maxCost !== null && counter.maxCost !== undefined && typeof counter.maxCost !== 'number') {
    throw new Error('counter.maxCost must be a number or null');
  }
}

// ---------------------------------------------------------------------------
// proposeNegotiation
// ---------------------------------------------------------------------------

async function proposeNegotiation(env, { agentId, intentId, serviceUrl, request }) {
  if (!agentId) throw new Error('agentId is required');
  if (!intentId) throw new Error('intentId is required');
  if (!serviceUrl) throw new Error('serviceUrl is required');
  if (!request || !request.goal) throw new Error('request.goal is required');

  const redis = getRedis(env);
  const negotiationId = generateNegotiationId();
  const now = new Date().toISOString();

  const negotiation = {
    negotiationId,
    intentId,
    agentId,
    serviceUrl,
    status: 'proposed',
    request: {
      goal: request.goal,
      constraints: request.constraints || {},
    },
    terms: null,
    counter: null,
    agreement: null,
    created: now,
    updated: now,
  };

  await redis.set(`negotiation:${negotiationId}`, JSON.stringify(negotiation));
  await redis.zadd(`negotiations:agent:${agentId}`, { score: Date.now(), member: negotiationId });

  return { negotiationId, status: 'proposed' };
}

// ---------------------------------------------------------------------------
// offerTerms — service responds with what it can do
// ---------------------------------------------------------------------------

async function offerTerms(env, negotiationId, terms) {
  const redis = getRedis(env);
  const raw = await redis.get(`negotiation:${negotiationId}`);
  if (!raw) throw new Error('Negotiation not found');

  const negotiation = typeof raw === 'string' ? JSON.parse(raw) : raw;

  if (negotiation.status !== 'proposed' && negotiation.status !== 'countered') {
    throw new Error('Cannot offer terms on a negotiation with status: ' + negotiation.status);
  }

  validateTerms(terms);

  negotiation.terms = {
    description: terms.description,
    cost: terms.cost || null,
    timeframe: terms.timeframe || 'instant',
    dataScope: terms.dataScope || [],
    requirements: terms.requirements || [],
    confidence: terms.confidence,
    expiresAt: terms.expiresAt,
  };
  negotiation.status = 'terms_offered';
  negotiation.updated = new Date().toISOString();

  await redis.set(`negotiation:${negotiationId}`, JSON.stringify(negotiation));

  return { updated: true };
}

// ---------------------------------------------------------------------------
// evaluateTerms — agent logic to decide accept/counter/reject
// ---------------------------------------------------------------------------

function evaluateTerms(negotiation, agentPreferences) {
  if (!negotiation || !negotiation.terms) {
    return { recommendation: 'reject', reason: 'No terms to evaluate', suggestedCounter: null };
  }

  const terms = negotiation.terms;
  const prefs = agentPreferences || {};

  // Check expiration
  if (terms.expiresAt && new Date(terms.expiresAt) < new Date()) {
    return { recommendation: 'reject', reason: 'Terms have expired', suggestedCounter: null };
  }

  // Check confidence threshold
  const minConfidence = prefs.minConfidence || 0.5;
  if (terms.confidence < minConfidence) {
    return {
      recommendation: 'reject',
      reason: `Confidence ${terms.confidence} below minimum ${minConfidence}`,
      suggestedCounter: null,
    };
  }

  // Check cost against budget
  if (terms.cost && prefs.maxBudget !== undefined && prefs.maxBudget !== null) {
    if (terms.cost.amount > prefs.maxBudget) {
      return {
        recommendation: 'counter',
        reason: `Cost ${terms.cost.amount} ${terms.cost.currency} exceeds budget ${prefs.maxBudget}`,
        suggestedCounter: {
          maxCost: prefs.maxBudget,
          preferredTimeframe: prefs.preferredTimeframe || terms.timeframe,
          reducedScope: null,
        },
      };
    }
  }

  // Check timeframe preference
  const timeframeRank = { instant: 0, '1h': 1, '24h': 2 };
  if (prefs.preferredTimeframe && timeframeRank[prefs.preferredTimeframe] !== undefined) {
    const offeredRank = timeframeRank[terms.timeframe];
    const preferredRank = timeframeRank[prefs.preferredTimeframe];
    if (offeredRank !== undefined && offeredRank > preferredRank) {
      return {
        recommendation: 'counter',
        reason: `Timeframe "${terms.timeframe}" slower than preferred "${prefs.preferredTimeframe}"`,
        suggestedCounter: {
          maxCost: prefs.maxBudget || null,
          preferredTimeframe: prefs.preferredTimeframe,
          reducedScope: null,
        },
      };
    }
  }

  // Check data requirements against restricted fields
  if (prefs.restrictedFields && prefs.restrictedFields.length > 0 && terms.requirements) {
    const blocked = terms.requirements.filter((r) => prefs.restrictedFields.includes(r));
    if (blocked.length > 0) {
      return {
        recommendation: 'reject',
        reason: `Service requires restricted data: ${blocked.join(', ')}`,
        suggestedCounter: null,
      };
    }
  }

  // All checks pass
  return { recommendation: 'accept', reason: 'Terms within all constraints', suggestedCounter: null };
}

// ---------------------------------------------------------------------------
// acceptTerms
// ---------------------------------------------------------------------------

async function acceptTerms(env, negotiationId, agentSignature) {
  if (!agentSignature) throw new Error('agentSignature is required');

  const redis = getRedis(env);
  const raw = await redis.get(`negotiation:${negotiationId}`);
  if (!raw) throw new Error('Negotiation not found');

  const negotiation = typeof raw === 'string' ? JSON.parse(raw) : raw;

  if (negotiation.status !== 'terms_offered') {
    throw new Error('Cannot accept — negotiation status is: ' + negotiation.status);
  }

  // Check expiration
  if (negotiation.terms.expiresAt && new Date(negotiation.terms.expiresAt) < new Date()) {
    negotiation.status = 'expired';
    negotiation.updated = new Date().toISOString();
    await redis.set(`negotiation:${negotiationId}`, JSON.stringify(negotiation));
    throw new Error('Terms have expired');
  }

  const now = new Date().toISOString();

  negotiation.agreement = {
    terms: { ...negotiation.terms },
    agreedAt: now,
    signature: agentSignature,
  };
  negotiation.status = 'accepted';
  negotiation.updated = now;

  await redis.set(`negotiation:${negotiationId}`, JSON.stringify(negotiation));

  return { agreement: negotiation.agreement };
}

// ---------------------------------------------------------------------------
// counterTerms
// ---------------------------------------------------------------------------

async function counterTerms(env, negotiationId, counter) {
  const redis = getRedis(env);
  const raw = await redis.get(`negotiation:${negotiationId}`);
  if (!raw) throw new Error('Negotiation not found');

  const negotiation = typeof raw === 'string' ? JSON.parse(raw) : raw;

  if (negotiation.status !== 'terms_offered') {
    throw new Error('Cannot counter — negotiation status is: ' + negotiation.status);
  }

  validateCounter(counter);

  negotiation.counter = {
    maxCost: counter.maxCost !== undefined ? counter.maxCost : null,
    preferredTimeframe: counter.preferredTimeframe || null,
    reducedScope: counter.reducedScope || null,
  };
  negotiation.status = 'countered';
  negotiation.updated = new Date().toISOString();

  await redis.set(`negotiation:${negotiationId}`, JSON.stringify(negotiation));

  return { updated: true };
}

// ---------------------------------------------------------------------------
// rejectTerms
// ---------------------------------------------------------------------------

async function rejectTerms(env, negotiationId, reason) {
  const redis = getRedis(env);
  const raw = await redis.get(`negotiation:${negotiationId}`);
  if (!raw) throw new Error('Negotiation not found');

  const negotiation = typeof raw === 'string' ? JSON.parse(raw) : raw;

  if (negotiation.status === 'accepted') {
    throw new Error('Cannot reject an accepted negotiation');
  }

  negotiation.status = 'rejected';
  negotiation.rejectionReason = reason || null;
  negotiation.updated = new Date().toISOString();

  await redis.set(`negotiation:${negotiationId}`, JSON.stringify(negotiation));

  return { rejected: true };
}

// ---------------------------------------------------------------------------
// getNegotiation
// ---------------------------------------------------------------------------

async function getNegotiation(env, negotiationId) {
  const redis = getRedis(env);
  const raw = await redis.get(`negotiation:${negotiationId}`);
  if (!raw) throw new Error('Negotiation not found');
  const negotiation = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return { negotiation };
}

// ---------------------------------------------------------------------------
// listNegotiations
// ---------------------------------------------------------------------------

async function listNegotiations(env, agentId) {
  const redis = getRedis(env);
  const ids = await redis.zrange(`negotiations:agent:${agentId}`, 0, -1, { rev: true });
  if (!ids || ids.length === 0) return { negotiations: [] };

  const negotiations = [];
  for (const id of ids) {
    const raw = await redis.get(`negotiation:${id}`);
    if (raw) {
      negotiations.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
    }
  }

  return { negotiations };
}

module.exports = {
  proposeNegotiation,
  offerTerms,
  evaluateTerms,
  acceptTerms,
  counterTerms,
  rejectTerms,
  getNegotiation,
  listNegotiations,
};
