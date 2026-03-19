#!/usr/bin/env node

// Usage: UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... node scripts/create-key.js [owner] [tier]
// Example: node scripts/create-key.js "david" "pro"

const crypto = require('crypto');

async function main() {
  const { Redis } = require('@upstash/redis');

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
    process.exit(1);
  }

  const redis = new Redis({ url, token });
  const owner = process.argv[2] || 'default';
  const tier = process.argv[3] || 'free';
  const key = `op_${crypto.randomBytes(24).toString('hex')}`;

  await redis.hset(`apikey:${key}`, {
    owner,
    tier,
    active: 'true',
    created: Date.now().toString(),
  });

  console.log('');
  console.log('API key created:');
  console.log(`  Key:   ${key}`);
  console.log(`  Owner: ${owner}`);
  console.log(`  Tier:  ${tier}`);
  console.log('');
  console.log('Usage:');
  console.log(`  curl -H "X-API-Key: ${key}" https://api.openprimitive.com/v1/flights`);
  console.log('');
}

main().catch(console.error);
