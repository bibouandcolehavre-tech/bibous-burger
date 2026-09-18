const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const alerts = require('../restaurant-dashboard/alerts');

const paid = (id, status = 'confirmed') => ({ id, status, payment: { status: 'PAID' } });

test('initial snapshots are silent, including existing demands', () => {
  const tracker = alerts.createArrivalTracker();
  assert.deepEqual(tracker.update('orders', [paid('existing')]), []);
  assert.deepEqual(tracker.update('reservations', [{ id: 'r', status: 'pending' }]), []);
  assert.deepEqual(tracker.update('orders', [paid('existing'), paid('new')]).map(item => item.id), ['new']);
});

test('first paid order after an empty list rings once, with no duplicates after an empty response', () => {
  const tracker = alerts.createArrivalTracker();
  tracker.update('orders', []);
  assert.equal(tracker.update('orders', [paid('one'), paid('one')]).length, 1);
  assert.equal(tracker.update('orders', [paid('one')]).length, 0);
  tracker.update('orders', []);
  assert.equal(tracker.update('orders', [paid('one')]).length, 0);
});

test('unpaid, failed, accepted and cancelled orders do not alert; successful payment does', () => {
  const tracker = alerts.createArrivalTracker();
  tracker.update('orders', []);
  assert.equal(tracker.update('orders', [
    { ...paid('pending'), payment: { status: 'PENDING' } },
    { ...paid('failed'), payment: { status: 'FAILED' } },
    paid('cancelled', 'cancelled'), paid('accepted', 'preparing'), null
  ]).length, 0);
  assert.equal(tracker.update('orders', [paid('pending')]).length, 1);
});

test('reservation and reward feeds are independent and ignore inactive demands', () => {
  const tracker = alerts.createArrivalTracker();
  tracker.update('reservations', []);
  tracker.update('rewards', []);
  assert.equal(tracker.update('reservations', [{ id: 'one', status: 'pending' }, { id: 'no', status: 'cancelled' }]).length, 1);
  assert.equal(tracker.update('rewards', [{ id: 'one', status: 'active' }, { id: 'no', status: 'used' }]).length, 1);
});

test('invalid responses never establish a baseline', () => {
  const tracker = alerts.createArrivalTracker();
  assert.throws(() => tracker.update('orders', undefined));
  assert.equal(tracker.update('orders', [paid('existing')]).length, 0);
});

test('connection status distinguishes initialization, healthy, offline, failed and stale feeds', () => {
  const now = Date.now();
  const fresh = [{ lastSuccess: now, error: false }];
  assert.match(alerts.connectionStatus([{ lastSuccess: 0 }], true, now).text, /Connexion/);
  assert.equal(alerts.connectionStatus(fresh, true, now).warning, false);
  assert.match(alerts.connectionStatus(fresh, false, now).text, /Hors ligne/);
  assert.equal(alerts.connectionStatus([{ lastSuccess: now, error: true }], true, now).warning, true);
  assert.equal(alerts.connectionStatus(fresh, true, now + 45001).warning, true);
});

class FakeAudioContext {
  constructor() { this.state = 'suspended'; this.currentTime = 10; this.destination = {}; this.oscillators = []; this.gains = []; }
  async resume() { this.state = 'running'; this.onstatechange?.(); }
  createOscillator() {
    const node = { frequency: { setValueAtTime: value => { node.hertz = value; } }, connect() {}, disconnect() {}, start(at) { this.startAt = at; }, stop(at) { this.stopAt = at; if (at === undefined) this.stopped = true; } };
    this.oscillators.push(node); return node;
  }
  createGain() {
    const node = { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() { node.cancelled = true; } }, connect() {}, disconnect() {} };
    this.gains.push(node); return node;
  }
}

test('sound needs explicit activation, plays distinct tones and serializes simultaneous alerts', async () => {
  let audio;
  const player = alerts.createSoundPlayer({ createContext: () => (audio = new FakeAudioContext()) });
  assert.equal(player.play(), false);
  assert.equal(audio, undefined);
  assert.equal(await player.setEnabled(true), true);
  assert.equal(player.play('orders'), true);
  assert.equal(player.play('reservations'), true);
  assert.equal(audio.oscillators.length, 5);
  assert.deepEqual(audio.oscillators.map(node => node.hertz), [659.25, 783.99, 1046.5, 523.25, 659.25]);
  assert.ok(audio.oscillators[3].startAt > audio.oscillators[2].stopAt);
  await player.setEnabled(false);
  assert.ok(audio.oscillators.every(node => node.stopped));
  assert.ok(audio.gains.every(node => node.cancelled));
  assert.equal(player.play(), false);
});

test('suspended audio is reported inactive until resumed and unsupported browsers stay silent', async () => {
  const audio = new FakeAudioContext();
  const player = alerts.createSoundPlayer({ createContext: () => audio });
  await player.setEnabled(true);
  audio.state = 'suspended'; audio.onstatechange();
  assert.equal(player.state().ready, false);
  assert.equal(player.play(), false);
  assert.equal(await player.setEnabled(true), true);
  const unsupported = alerts.createSoundPlayer({ createContext: null });
  assert.equal(await unsupported.setEnabled(true), false);
  assert.equal(unsupported.state().supported, false);
});

test('playback failures are visible and recoverable on a new activation', async () => {
  const audio = new FakeAudioContext();
  const player = alerts.createSoundPlayer({ createContext: () => audio });
  await player.setEnabled(true);
  audio.createOscillator = () => { throw new Error('audio device unavailable'); };
  assert.equal(player.play(), false);
  assert.equal(player.state().ready, false);
  delete audio.createOscillator;
  assert.equal(await player.setEnabled(true), true);
  assert.equal(player.play(), true);
});

// Execute the real dashboard controller against fake DOM/API/audio, without any
// production accounts, payments, orders, SMS, network or wall-clock waits.
function dashboardHarness() {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, { textContent: '', value: '', innerHTML: '', hidden: false, disabled: false, handlers: {}, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, addEventListener(event, fn) { this.handlers[event] = fn; } });
    return elements.get(selector);
  };
  let timerId = 0;
  const timers = new Map();
  const setTimeoutFake = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; };
  const storage = new Map([['bibous-dashboard-token', 'test-only']]);
  const audio = new FakeAudioContext();
  const context = vm.createContext({
    BibouAlerts: alerts, console, AbortController,
    document: { title: '', querySelector: element, querySelectorAll: () => [], addEventListener() {} },
    navigator: { onLine: true },
    window: { location: { hostname: 'localhost' }, AudioContext: function () { return audio; }, setTimeout: setTimeoutFake, setInterval() {}, addEventListener() {} },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout: setTimeoutFake, clearTimeout: id => timers.delete(id),
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ orders: [], reservations: [], claims: [] }) })
  });
  const run = source => vm.runInContext(source, context);
  run(fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/app.js'), 'utf8'));
  return { context, run, element, audio, flush: () => { for (const [id, timer] of [...timers]) if (timer.ms === 250) { timers.delete(id); timer.fn(); } } };
}

test('dashboard sounds once for a paid arrival; mute preserves visual alerts without replay', async () => {
  const h = dashboardHarness();
  await h.run('refreshFeeds()');
  assert.equal(h.element('#arrival-message').textContent, '');
  await h.element('#sound-button').handlers.click({ currentTarget: h.element('#sound-button') });
  const activationNotes = h.audio.oscillators.length;
  const order = { ...paid('new'), number: 1, createdAt: new Date().toISOString(), serviceDate: '2099-01-01', slot: '19:00', total: 16.90, items: [], customerName: 'Test' };
  h.context.fetch = async () => ({ ok: true, status: 200, json: async () => ({ orders: [order] }) });
  await h.run('loadOrders()'); h.flush();
  assert.equal(h.audio.oscillators.length, activationNotes + 3);
  assert.match(h.element('#attention-orders').textContent, /1 commande/);
  assert.match(h.element('#arrival-message').textContent, /commande payée/);
  await h.run('loadOrders()'); h.flush();
  assert.equal(h.audio.oscillators.length, activationNotes + 3);
  await h.element('#sound-button').handlers.click({ currentTarget: h.element('#sound-button') });
  h.context.fetch = async () => ({ ok: true, status: 200, json: async () => ({ reservations: [{ id: 'table', number: 1, status: 'pending', serviceDate: '2099-01-01', guests: 2 }] }) });
  await h.run('loadReservations()'); h.flush();
  assert.match(h.element('#arrival-message').textContent, /réservation/);
  assert.match(h.element('#attention-reservations').textContent, /1 réservation/);
  assert.equal(h.audio.oscillators.length, activationNotes + 3);
  await h.element('#sound-button').handlers.click({ currentTarget: h.element('#sound-button') });
  const afterReactivation = h.audio.oscillators.length;
  await h.run('loadReservations()'); h.flush();
  assert.equal(h.audio.oscillators.length, afterReactivation);
});

test('dashboard deduplicates in-flight reads, reports failure and returns to login on 401', async () => {
  const h = dashboardHarness();
  await h.run('refreshFeeds()');
  let resolveResponse;
  let calls = 0;
  h.context.fetch = () => { calls++; return new Promise(resolve => { resolveResponse = resolve; }); };
  const first = h.run('loadOrders()');
  const second = h.run('loadOrders()');
  assert.equal(calls, 1);
  resolveResponse({ ok: false, status: 503 });
  assert.equal(await first, false); await second;
  assert.match(h.element('#connection-status').textContent, /interrompue/);
  h.context.fetch = async () => ({ ok: true, status: 200, json: async () => ({ orders: [] }) });
  await h.run('loadOrders()');
  assert.match(h.element('#connection-status').textContent, /À jour/);
  h.context.fetch = async () => ({ ok: false, status: 401 });
  await h.run('loadOrders()');
  assert.equal(h.element('#login-screen').hidden, false);
  assert.equal(h.element('#dashboard-app').hidden, true);
  assert.match(h.element('#login-error').textContent, /session a expiré/);
});
