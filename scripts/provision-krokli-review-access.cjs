'use strict';
// Explicit one-off provisioning only; never part of builds or server startup.
// The password stays in a mode-0600 ignored file. Only its high-entropy verifier
// is printed, for insertion into the reviewed public server configuration.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'secrets');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const target = path.join(directory, 'krokli-store-review.json');
const username = require('../server/krokli-review-sandbox').USERNAME;
const password = crypto.randomBytes(24).toString('base64url');
fs.writeFileSync(target, JSON.stringify({ username, password, createdAt: new Date().toISOString(),
  intendedRecipients: ['Apple App Review', 'Google Play App Review'], isolated: true }, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ username, passwordHash: crypto.createHash('sha256').update(password).digest('hex'),
  privateCredentialSaved: true, passwordDisplayed: false }));
