const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDashboardSessionStore, SESSION_LIFETIME_MS } = require('./dashboard-sessions');

test('la session restaurant survit aux redémarrages sans stocker le jeton en clair', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bibou-dashboard-sessions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'sessions.json');
  let time = 1_000_000;
  const options = { now: () => time, secret: 'restaurant-password-a' };
  const token = createDashboardSessionStore(file, options).issue();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(fs.readFileSync(file, 'utf8').includes(token), false);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  time += 60 * 60 * 1000;
  assert.equal(createDashboardSessionStore(file, options).valid(token), true);
});

test('une session utilisée est renouvelée, mais une session oubliée expire et peut être révoquée', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bibou-dashboard-sessions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'sessions.json');
  let time = 10_000;
  const options = { now: () => time, secret: 'restaurant-password-a' };
  const store = createDashboardSessionStore(file, options);
  const token = store.issue();
  time += SESSION_LIFETIME_MS - 1000;
  assert.equal(store.valid(token), true);
  time += 2000;
  assert.equal(createDashboardSessionStore(file, options).valid(token), true);
  store.revoke(token);
  assert.equal(createDashboardSessionStore(file, options).valid(token), false);
  const forgotten = store.issue();
  time += SESSION_LIFETIME_MS + 1;
  assert.equal(store.valid(forgotten), false);
});

test('un fichier de sessions abîmé ne crée pas silencieusement des accès', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bibou-dashboard-sessions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'sessions.json');
  fs.writeFileSync(file, '{invalid');
  assert.throws(() => createDashboardSessionStore(file, { secret: 'restaurant-password-a' }));
});

test('changer le mot de passe invalide les sessions déjà créées', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bibou-dashboard-sessions-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'sessions.json');
  const token = createDashboardSessionStore(file, { secret: 'restaurant-password-a' }).issue();
  assert.equal(createDashboardSessionStore(file, { secret: 'restaurant-password-a' }).valid(token), true);
  assert.equal(createDashboardSessionStore(file, { secret: 'restaurant-password-b' }).valid(token), false);
});
