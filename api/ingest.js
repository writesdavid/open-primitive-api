const { ingest } = require('../scripts/ingest');

module.exports = async function handler(req, res) {
  // Vercel crons send GET requests. Also allow POST for manual triggers.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional: protect with a shared secret
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const results = await ingest();
    const ok = results.filter((r) => r.status === 'ok').length;
    const failed = results.length - ok;

    res.status(failed === results.length ? 502 : 200).json({
      date: new Date().toISOString().slice(0, 10),
      succeeded: ok,
      failed,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
