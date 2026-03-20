#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

// Save to .keys directory
const keysDir = path.join(__dirname, '..', '.keys');
if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir);

fs.writeFileSync(path.join(keysDir, 'public.pem'), pubPem);
fs.writeFileSync(path.join(keysDir, 'private.pem'), privPem);

// Also output base64 public key for the manifest
const pubDer = publicKey.export({ type: 'spki', format: 'der' });
console.log('Keys generated in .keys/');
console.log('Public key (base64 for manifest):', pubDer.toString('base64'));
console.log('');
console.log('Add to .well-known/opp.json:');
console.log(`  "publicKey": "ed25519:${pubDer.toString('base64')}"`);
