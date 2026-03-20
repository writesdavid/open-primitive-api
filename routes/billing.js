const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

let redis = null;
let stripe = null;

function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

function getStripe() {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

const TIER_CONFIG = {
  builder: {
    priceEnv: 'STRIPE_PRICE_BUILDER',
    daily: 500,
    monthly: 10000,
    keysAllowed: 3,
    ratePerMin: 60,
  },
  pro: {
    priceEnv: 'STRIPE_PRICE_PRO',
    daily: 5000,
    monthly: 100000,
    keysAllowed: 10,
    ratePerMin: 120,
  },
  enterprise: {
    daily: Infinity,
    monthly: Infinity,
    keysAllowed: Infinity,
    ratePerMin: Infinity,
  },
};

const FREE_LIMITS = { daily: 50, monthly: 500 };

// POST /v1/billing/checkout
async function handleCheckout(req, res) {
  const s = getStripe();
  if (!s) {
    return res.status(503).json({ error: 'Billing not configured.' });
  }

  const { tier, email } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required.' });
  }

  if (!tier || !TIER_CONFIG[tier]) {
    return res.status(400).json({ error: 'Tier must be builder, pro, or enterprise.' });
  }

  if (tier === 'enterprise') {
    return res.json({ url: 'mailto:david@openprimitive.com' });
  }

  const priceId = process.env[TIER_CONFIG[tier].priceEnv];
  if (!priceId) {
    return res.status(503).json({ error: `Price not configured for ${tier} tier.` });
  }

  try {
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.protocol}://${req.get('host')}/upgrade.html?success=1`,
      cancel_url: `${req.protocol}://${req.get('host')}/upgrade.html?canceled=1`,
      metadata: { tier, email },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err.message);
    return res.status(500).json({ error: 'Failed to create checkout session.' });
  }
}

// POST /v1/billing/webhook
async function handleWebhook(req, res) {
  const s = getStripe();
  if (!s) return res.sendStatus(503);

  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !endpointSecret) {
    return res.sendStatus(400);
  }

  let event;
  try {
    event = s.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature.' });
  }

  const r = getRedis();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.metadata.email || session.customer_email;
    const tier = session.metadata.tier || 'builder';
    const customerId = session.customer;

    if (r && email) {
      try {
        // Check for existing key
        let key = await r.get(`email:${email}`);
        if (!key) {
          key = `op_${crypto.randomBytes(24).toString('hex')}`;
          await r.set(`email:${email}`, key);
        }

        await r.hset(`apikey:${key}`, {
          owner: email,
          tier: tier,
          active: 'true',
          stripeCustomerId: customerId,
          stripeSubscriptionId: session.subscription || '',
          upgraded: Date.now().toString(),
        });

        // If this was a Founding 50 checkout, increment the counter
        if (session.metadata.founding === 'true') {
          await r.incr('founding:count');
          console.log(`Founding 50 spot claimed by ${email}`);
        }

        console.log(`Upgraded ${email} to ${tier}, key: ${key.slice(0, 8)}...`);
      } catch (err) {
        console.error('Webhook Redis error:', err.message);
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const customerId = subscription.customer;

    if (r && customerId) {
      try {
        // Find key by customer ID — scan is expensive but cancellations are rare
        const keys = await r.keys('apikey:op_*');
        for (const redisKey of keys) {
          const data = await r.hgetall(redisKey);
          if (data && data.stripeCustomerId === customerId) {
            await r.hset(redisKey, {
              tier: 'free',
              stripeSubscriptionId: '',
              downgraded: Date.now().toString(),
            });
            console.log(`Downgraded ${data.owner} to free`);
            break;
          }
        }
      } catch (err) {
        console.error('Downgrade error:', err.message);
      }
    }
  }

  res.json({ received: true });
}

// GET /v1/billing/usage
async function handleUsage(req, res) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required. Pass via X-API-Key header.' });
  }

  const r = getRedis();
  if (!r) {
    return res.status(503).json({ error: 'Usage tracking not configured.' });
  }

  try {
    const keyData = await r.hgetall(`apikey:${apiKey}`);
    if (!keyData || keyData.active !== 'true') {
      return res.status(403).json({ error: 'Invalid or inactive API key.' });
    }

    const tier = keyData.tier || 'free';
    const config = TIER_CONFIG[tier] || null;
    const dailyLimit = config ? config.daily : FREE_LIMITS.daily;
    const monthlyLimit = config ? config.monthly : FREE_LIMITS.monthly;

    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);

    // Get daily usage
    const dailyUsage = (await r.get(`usage:${apiKey}:${today}`)) || 0;

    // Get monthly usage — sum all days in this month
    const monthKeys = await r.keys(`usage:${apiKey}:${month}-*`);
    let monthlyUsage = 0;
    if (monthKeys.length > 0) {
      const values = await Promise.all(monthKeys.map(k => r.get(k)));
      monthlyUsage = values.reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0);
    }

    return res.json({
      key: apiKey.slice(0, 8) + '...',
      tier,
      usage: {
        today: parseInt(dailyUsage, 10) || 0,
        thisMonth: monthlyUsage,
      },
      limit: {
        daily: dailyLimit,
        monthly: monthlyLimit,
      },
    });
  } catch (err) {
    console.error('Usage lookup error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch usage.' });
  }
}

// POST /v1/billing/founding
// "Founding 50" — first 50 Builder subscribers get $19/mo forever (34% off $29).
//
// SETUP: Create a coupon in Stripe Dashboard:
//   Coupons → Add → Percent off: 34% → Duration: forever → Name: "Founding 50" → ID: "founding50"
//
// Then set env var STRIPE_COUPON_FOUNDING=founding50
async function handleFoundingCheckout(req, res) {
  const s = getStripe();
  if (!s) {
    return res.status(503).json({ error: 'Billing not configured.' });
  }

  const r = getRedis();
  if (!r) {
    return res.status(503).json({ error: 'Redis not configured.' });
  }

  const { email } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required.' });
  }

  try {
    const count = (await r.get('founding:count')) || 0;
    if (parseInt(count, 10) >= 50) {
      return res.status(410).json({ error: 'Founding 50 spots are filled.' });
    }

    const priceId = process.env[TIER_CONFIG.builder.priceEnv];
    if (!priceId) {
      return res.status(503).json({ error: 'Builder price not configured.' });
    }

    const couponId = process.env.STRIPE_COUPON_FOUNDING || 'founding50';

    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      discounts: [{ coupon: couponId }],
      success_url: `${req.protocol}://${req.get('host')}/upgrade.html?success=1&founding=1`,
      cancel_url: `${req.protocol}://${req.get('host')}/upgrade.html?canceled=1`,
      metadata: { tier: 'builder', email, founding: 'true' },
    });

    return res.json({ url: session.url, spotsRemaining: 50 - parseInt(count, 10) });
  } catch (err) {
    console.error('Founding checkout error:', err.message);
    return res.status(500).json({ error: 'Failed to create founding checkout session.' });
  }
}

module.exports = { handleCheckout, handleWebhook, handleUsage, handleFoundingCheckout };
