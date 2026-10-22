const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

test('Le paquet Docker démarre avec tous les modules des actualités', { timeout: 15000 }, async t => {
  const root = path.resolve(__dirname, '..');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-deployment-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    await fs.rm(directory, { recursive: true, force: true });
  });
  const dockerfile = await fs.readFile(path.join(root, 'Dockerfile'), 'utf8');
  const copies = [...dockerfile.matchAll(/^COPY\s+(\S+)\s+(\S+)\s*$/gm)];
  assert.ok(copies.length, 'Les fichiers du serveur doivent être copiés dans le paquet.');
  for (const [, source, destination] of copies) {
    const from = path.resolve(root, source);
    const to = path.resolve(directory, destination);
    assert.ok(to.startsWith(directory + path.sep));
    if (source === 'server') {
      // Audited JavaScript plus explicitly allowlisted public configuration: never
      // copy arbitrary JSON such as local customer databases or credentials.
      await fs.mkdir(to, { recursive: true });
      for (const file of await fs.readdir(from)) {
        if (['iban-registry.json','krokli-review-access.json','krokli-field-test-access.json'].includes(file)||file.endsWith('.js')&&!file.endsWith('.test.js')) await fs.copyFile(path.join(from, file), path.join(to, file));
      }
      const reviewAccess = JSON.parse(await fs.readFile(path.join(to, 'krokli-review-access.json'), 'utf8'));
      assert.deepEqual(Object.keys(reviewAccess).sort(), ['passwordHash','username']);
      assert.equal(reviewAccess.username, 'store-review-krokli');
      assert.match(reviewAccess.passwordHash, /^(?:[a-f0-9]{64})?$/);
      const fieldAccess = JSON.parse(await fs.readFile(path.join(to, 'krokli-field-test-access.json'), 'utf8'));
      assert.deepEqual(Object.keys(fieldAccess).sort(), ['accessHash','enabled','expiresAt']);
      assert.equal(typeof fieldAccess.enabled, 'boolean');
      assert.match(fieldAccess.accessHash, /^(?:[a-f0-9]{64})?$/);
    } else if (source === 'driver-app') {
      const expected = ['app.js', 'apple-touch-icon.png', 'gps.js', 'guidance-core.js', 'guidance.js', 'icon-192.png', 'icon-512.png', 'icon.svg', 'index.html', 'leaflet-LICENSE.txt', 'leaflet.css', 'leaflet.js', 'manifest.webmanifest', 'navigation-core.js', 'navigation.js', 'phone-contact.js', 'style.css', 'sw.js'];
      assert.deepEqual((await fs.readdir(from)).sort(), expected, 'Le paquet livreur ne doit contenir que les fichiers publics prévus.');
      await fs.mkdir(to, { recursive: true });
      for (const file of expected) await fs.copyFile(path.join(from, file), path.join(to, file));
    } else {
      assert.ok(source.endsWith('.js'), 'Unexpected runtime asset: extend this packaging test explicitly.');
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
    }
  }
  child = spawn(process.execPath, ['server/server.js'], {
    cwd: directory,
    env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', DATA_FILE_PATH: path.join(directory, 'test-data.json'), SESSION_SECRET: 'deployment-test-only', RESTAURANT_DASHBOARD_PASSWORD: 'deployment-test-only' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      const match = String(chunk).match(/http:\/\/localhost:\d+/);
      if (match) resolve(match[0]);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Le paquet serveur ne démarre pas (${code}): ${errors}`)));
  });
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  assert.equal((await fetch(base + '/driver/')).status, 200);
  const phone = await fetch(base + '/driver/phone-contact.js');
  assert.equal(phone.status, 200);
  assert.match(phone.headers.get('content-type'), /javascript/);
  assert.match(await phone.text(), /KrokliPhoneContact/);
  for (const file of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
    const icon = await fetch(base + '/driver/' + file);
    assert.equal(icon.status, 200); assert.equal(icon.headers.get('content-type'), 'image/png');
  }
  const news = await (await fetch(base + '/api/news')).json();
  const { publicNews } = require('./news');
  assert.deepEqual(news.items, publicNews({}, new Date()).items);
  assert.equal(new Set(news.items.map(item => item.id)).size, news.items.length);
  assert.ok(news.items.every(item => item.kind !== 'product'));
  assert.deepEqual(await (await fetch(base + '/api/contest')).json(), { status: 'inactive' });
});
