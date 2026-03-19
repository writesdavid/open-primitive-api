const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

let redis = null;

function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function handleRegister(req, res) {
  const { email } = req.body || {};

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email address required.' });
  }

  const r = getRedis();

  // No Redis — return demo key
  if (!r) {
    const demoKey = `op_demo_${crypto.randomBytes(12).toString('hex')}`;
    return res.json({
      key: demoKey,
      tier: 'free',
      limit: '500 calls/month',
      note: 'Demo mode. No Redis configured — this key is not persisted.',
    });
  }

  try {
    // Check if email already registered
    const existingKey = await r.get(`email:${email}`);
    if (existingKey) {
      return res.json({
        key: existingKey,
        tier: 'free',
        limit: '500 calls/month',
        existing: true,
      });
    }

    // Generate and store new key
    const key = `op_${crypto.randomBytes(24).toString('hex')}`;

    await r.hset(`apikey:${key}`, {
      owner: email,
      tier: 'free',
      active: 'true',
      created: Date.now().toString(),
    });

    await r.set(`email:${email}`, key);

    return res.json({
      key,
      tier: 'free',
      limit: '500 calls/month',
    });
  } catch (err) {
    console.error('Registration error:', err.message);
    return res.status(500).json({ error: 'Registration failed. Try again.' });
  }
}

module.exports = { handleRegister };
