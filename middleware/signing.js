const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let privateKey = null;

function loadPrivateKey() {
  if (privateKey) return privateKey;
  // Try file first, then env var
  const keyPath = path.join(__dirname, '..', '.keys', 'private.pem');
  try {
    if (fs.existsSync(keyPath)) {
      const pem = fs.readFileSync(keyPath, 'utf8');
      privateKey = crypto.createPrivateKey(pem);
      return privateKey;
    }
  } catch {}
  if (process.env.OPP_PRIVATE_KEY) {
    privateKey = crypto.createPrivateKey(process.env.OPP_PRIVATE_KEY);
    return privateKey;
  }
  return null;
}

function signingMiddleware(req, res, next) {
  if (!req.path.startsWith('/v1')) return next();

  const originalJson = res.json.bind(res);
  res.json = function(data) {
    const key = loadPrivateKey();
    if (key && data && !data.error) {
      try {
        // Canonicalize: sort keys, stringify
        const canonical = JSON.stringify(data, Object.keys(data).sort());
        const signature = crypto.sign(null, Buffer.from(canonical), key);

        // Add proof to response
        data.proof = {
          type: 'DataIntegrityProof',
          cryptosuite: 'eddsa-jcs-2022',
          verificationMethod: 'https://api.openprimitive.com/.well-known/opp.json#publicKey',
          created: new Date().toISOString(),
          proofValue: signature.toString('base64url'),
        };
      } catch (err) {
        // Sign failure is not a request failure — serve unsigned
        console.error('Signing error:', err.message);
      }
    }
    return originalJson(data);
  };
  next();
}

module.exports = { signingMiddleware };
