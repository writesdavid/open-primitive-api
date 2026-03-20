#!/usr/bin/env node

const { Redis } = require('@upstash/redis');

const DOMAINS = [
  {
    name: 'food',
    fn: () => require('../sources/food').getRecent(),
    summarize: (data) => {
      const count = data.recalls ? data.recalls.length : 0;
      return `${count} recalls archived`;
    },
  },
  {
    name: 'products',
    fn: () => require('../sources/products').getRecent(),
    summarize: (data) => {
      const count = data.recalls ? data.recalls.length : 0;
      return `${count} recalls archived`;
    },
  },
  {
    name: 'jobs',
    fn: () => require('../sources/jobs').getUnemployment(),
    summarize: (data) => {
      const val = data.latest ? data.latest.value : 'unknown';
      return `unemployment ${val}% archived`;
    },
  },
  {
    name: 'flights',
    fn: () => require('../sources/flights').getAirlines(),
    summarize: (data) => {
      const count = Array.isArray(data) ? data.length : (data.airlines ? data.airlines.length : 0);
      return `${count} airlines archived`;
    },
  },
];

const TTL = 365 * 24 * 60 * 60; // 365 days in seconds

async function ingest() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
    process.exit(1);
  }

  const redis = new Redis({ url, token });
  const date = new Date().toISOString().slice(0, 10);
  const results = [];

  for (const domain of DOMAINS) {
    try {
      const data = await domain.fn();
      if (data && data.error) {
        console.error(`${domain.name}: ${data.error}`);
        results.push({ domain: domain.name, status: 'error', message: data.error });
        continue;
      }

      const key = `archive:${domain.name}:${date}`;
      const record = {
        data,
        timestamp: new Date().toISOString(),
        domain: domain.name,
      };

      await redis.set(key, JSON.stringify(record), { ex: TTL });

      const summary = domain.summarize(data);
      console.log(`${domain.name}: ${summary}`);
      results.push({ domain: domain.name, status: 'ok', summary });
    } catch (err) {
      console.error(`${domain.name}: failed — ${err.message}`);
      results.push({ domain: domain.name, status: 'error', message: err.message });
    }
  }

  return results;
}

// Run directly
if (require.main === module) {
  ingest().then((results) => {
    const ok = results.filter((r) => r.status === 'ok').length;
    const failed = results.length - ok;
    console.log(`\nDone. ${ok} succeeded, ${failed} failed.`);
    process.exit(failed > 0 ? 1 : 0);
  });
}

module.exports = { ingest };
