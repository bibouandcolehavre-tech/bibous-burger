'use strict';
// Explicit one-off owner provisioning. No credential is printed or committed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), dir = path.join(root, 'secrets');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const code = `essai-${crypto.randomBytes(24).toString('base64url')}`;
const expiresAt = new Date(Date.now() + 48 * 3600000).toISOString();
const target = path.join(dir, 'field-test-owner.json');
fs.writeFileSync(target, JSON.stringify({ username: require('../server/krokli-field-test').USERNAME, accessCode: code, expiresAt,
  intendedRecipient: 'Restaurant owner only', isolated: true }, null, 2), { flag: 'wx', mode: 0o600 });
process.stdout.write(JSON.stringify({ accessHash: crypto.createHash('sha256').update(code).digest('hex'), expiresAt,
  enabled: true, privateCredentialSaved: true, credentialDisplayed: false }) + '\n');
