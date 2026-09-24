const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Android : la configuration publique Firebase correspond au package Expo', () => {
  const root = path.join(__dirname, '..');
  const { expo } = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.equal(expo.android.googleServicesFile, './google-services.json');
  const raw = fs.readFileSync(path.join(root, expo.android.googleServicesFile), 'utf8');
  const config = JSON.parse(raw);
  assert.equal(config.configuration_version, '1');
  assert.equal(config.project_info.project_id, 'bibou-s-burgers');
  const client = config.client.find(item =>
    item.client_info.android_client_info.package_name === expo.android.package);
  assert.ok(client, 'Le package Android doit être enregistré dans Firebase.');
  assert.ok(client.client_info.mobilesdk_app_id.startsWith(`1:${config.project_info.project_number}:android:`));
  assert.ok(client.api_key.some(item => /^AIza[\w-]+$/.test(item.current_key)));
  assert.doesNotMatch(raw, /private_key|BEGIN PRIVATE KEY|"type"\s*:\s*"service_account"/,
    'Une clé de compte de service privée ne doit jamais entrer dans la configuration mobile.');
});
