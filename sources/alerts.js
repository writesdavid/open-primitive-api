const { Redis } = require('@upstash/redis');
const food = require('./food');
const products = require('./products');

const ALERT_KEY = 'alerts:feed';
const SNAPSHOT_KEY = 'alerts:snapshot';
const MAX_ALERTS = 50;

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

// ─── ALERT RULES ───
// Each rule: { domain, match(item) => alert | null }

const FOOD_RULES = {
  domain: 'food',
  extract(recalls) {
    return recalls
      .filter(r => r.classification === 'Class I')
      .map(r => ({
        domain: 'food',
        event: 'class_i_recall',
        severity: 'critical',
        title: `Class I Recall: ${(r.firm || 'Unknown firm').slice(0, 80)}`,
        summary: (r.reason || '').slice(0, 300),
        data: {
          product: r.product,
          firm: r.firm,
          recallNumber: r.recallNumber,
          date: r.date,
          distribution: r.distribution,
        },
        endpoint: '/v1/food',
        timestamp: new Date().toISOString(),
      }));
  },
  fingerprint(item) {
    return `food:${item.data.recallNumber || item.title}`;
  },
};

const PRODUCTS_RULES = {
  domain: 'products',
  extract(recalls) {
    const childKeywords = /child|infant|baby|toddler|kid|crib|stroller|toy|pacifier|nursery/i;
    return recalls
      .filter(r => {
        const text = `${r.title} ${r.description} ${(r.products || []).map(p => p.name).join(' ')}`;
        return childKeywords.test(text);
      })
      .map(r => ({
        domain: 'products',
        event: 'children_product_recall',
        severity: 'critical',
        title: `Children's Product Recall: ${(r.title || '').slice(0, 80)}`,
        summary: (r.description || '').slice(0, 300),
        data: {
          recallId: r.recallId,
          products: r.products,
          hazards: r.hazards,
          manufacturers: r.manufacturers,
          recallDate: r.recallDate,
          url: r.url,
        },
        endpoint: '/v1/products',
        timestamp: new Date().toISOString(),
      }));
  },
  fingerprint(item) {
    return `products:${item.data.recallId || item.title}`;
  },
};

// ─── CORE ───

async function getSnapshot() {
  const r = getRedis();
  if (!r) return {};
  const raw = await r.get(SNAPSHOT_KEY);
  if (!raw) return {};
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function saveSnapshot(snapshot) {
  const r = getRedis();
  if (!r) return;
  await r.set(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

async function pushAlerts(newAlerts) {
  const r = getRedis();
  if (!r) return;
  const raw = await r.get(ALERT_KEY);
  let existing = [];
  if (raw) {
    existing = typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
  const merged = [...newAlerts, ...existing].slice(0, MAX_ALERTS);
  await r.set(ALERT_KEY, JSON.stringify(merged));
}

async function checkForAlerts() {
  const snapshot = await getSnapshot();
  const newAlerts = [];

  // Food: Class I recalls
  try {
    const foodData = await food.getRecent();
    if (foodData.recalls && !foodData.error) {
      const candidates = FOOD_RULES.extract(foodData.recalls);
      for (const alert of candidates) {
        const fp = FOOD_RULES.fingerprint(alert);
        if (!snapshot[fp]) {
          newAlerts.push(alert);
          snapshot[fp] = Date.now();
        }
      }
    }
  } catch (err) {
    console.error('Alert check failed for food:', err.message);
  }

  // Products: children's recalls
  try {
    const productsData = await products.getRecent();
    if (productsData.recalls && !productsData.error) {
      const candidates = PRODUCTS_RULES.extract(productsData.recalls);
      for (const alert of candidates) {
        const fp = PRODUCTS_RULES.fingerprint(alert);
        if (!snapshot[fp]) {
          newAlerts.push(alert);
          snapshot[fp] = Date.now();
        }
      }
    }
  } catch (err) {
    console.error('Alert check failed for products:', err.message);
  }

  // Prune snapshot entries older than 90 days
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  for (const key of Object.keys(snapshot)) {
    if (snapshot[key] < cutoff) delete snapshot[key];
  }

  if (newAlerts.length > 0) {
    await pushAlerts(newAlerts);
  }
  await saveSnapshot(snapshot);

  return newAlerts;
}

async function getAlertFeed() {
  const r = getRedis();

  // No Redis: run a live check and return what we find
  if (!r) {
    const live = await checkForAlerts();
    return {
      alerts: live.slice(0, MAX_ALERTS),
      count: live.length,
      lastUpdated: new Date().toISOString(),
      note: 'Live check — no persistent store configured',
    };
  }

  const raw = await r.get(ALERT_KEY);
  let alerts = [];
  if (raw) {
    alerts = typeof raw === 'string' ? JSON.parse(raw) : raw;
  }

  return {
    alerts,
    count: alerts.length,
    lastUpdated: alerts.length > 0 ? alerts[0].timestamp : null,
  };
}

module.exports = { checkForAlerts, getAlertFeed };
