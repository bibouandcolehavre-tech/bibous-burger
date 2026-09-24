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
  constructor() { this.state = 'suspended'; this.currentTime = 10; this.destination = {}; this.oscillators = []; this.gains = []; this.sampleRate = 8000; this.sources = []; }
  createBuffer(channels, length) { const samples = new Float32Array(length); return { getChannelData: () => samples }; }
  createBufferSource() { const source = { connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } }; this.sources.push(source); return source; }
  async resume() { this.state = 'running'; this.onstatechange?.(); }
  createOscillator() {
    const node = { frequency: { setValueAtTime: value => { node.hertz = value; } }, connect() {}, disconnect() {}, start(at) { this.startAt = at; }, stop(at) { this.stopAt = at; if (at === undefined) this.stopped = true; } };
    this.oscillators.push(node); return node;
  }
  createGain() {
    const node = { gain: { setValueAtTime(value) { node.value = value; }, linearRampToValueAtTime(value) { node.peak = value; }, exponentialRampToValueAtTime() {}, cancelScheduledValues() { node.cancelled = true; } }, connect() {}, disconnect() {} };
    this.gains.push(node); return node;
  }
}

test('sound needs explicit activation, plays distinct tones and serializes simultaneous alerts', async () => {
  let audio;
  const player = alerts.createSoundPlayer({ createContext: () => (audio = new FakeAudioContext()) });
  assert.equal(player.play(), false);
  assert.equal(audio, undefined);
  assert.equal(await player.activate(), true);
  assert.equal(player.play('orders'), true);
  assert.equal(player.play('reservations'), true);
  assert.equal(audio.oscillators.length, 11);
  assert.deepEqual(audio.oscillators.slice(0, 9).map(node => node.hertz), [659.25, 783.99, 1046.5, 659.25, 783.99, 1046.5, 659.25, 783.99, 1046.5]);
  assert.ok(audio.oscillators[8].stopAt - audio.oscillators[0].startAt > 3);
  assert.ok(audio.gains.slice(0, 9).every(node => node.peak === 0.45));
  assert.ok(audio.oscillators[9].startAt > audio.oscillators[8].stopAt);
  player.stop();
  assert.ok(audio.oscillators.every(node => node.stopped));
  assert.ok(audio.gains.every(node => node.cancelled));
  assert.equal(player.setEnabled, undefined, 'No persistent mute API');
  assert.equal(player.state().ready, true, 'Session cleanup does not disable future alerts');
});

test('suspended audio is reported inactive until resumed and unsupported browsers stay silent', async () => {
  const audio = new FakeAudioContext();
  const player = alerts.createSoundPlayer({ createContext: () => audio });
  await player.activate();
  audio.state = 'suspended'; audio.onstatechange();
  assert.equal(player.state().ready, false);
  assert.equal(player.play(), false);
  assert.equal(await player.activate(), true);
  const unsupported = alerts.createSoundPlayer({ createContext: null });
  assert.equal(await unsupported.activate(), false);
  assert.equal(unsupported.state().supported, false);
});

test('playback failures are visible and recoverable on a new activation', async () => {
  const audio = new FakeAudioContext();
  const player = alerts.createSoundPlayer({ createContext: () => audio });
  await player.activate();
  audio.createOscillator = () => { throw new Error('audio device unavailable'); };
  assert.equal(player.play(), false);
  assert.equal(player.state().ready, false);
  delete audio.createOscillator;
  assert.equal(await player.activate(), true);
  assert.equal(player.play(), true);
});

// Execute the real dashboard controller against fake DOM/API/audio, without any
// production accounts, payments, orders, SMS, network or wall-clock waits.
function dashboardHarness({ savedSound = null } = {}) {
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
    localStorage: { getItem: key => key === 'bibous-restaurant-sound' ? savedSound : null, setItem() {} },
    setTimeout: setTimeoutFake, clearTimeout: id => timers.delete(id),
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ orders: [], reservations: [], claims: [] }) })
  });
  const run = source => vm.runInContext(source, context);
  run(fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/app.js'), 'utf8'));
  return { context, run, element, audio, flush: () => { for (const [id, timer] of [...timers]) if (timer.ms === 250) { timers.delete(id); timer.fn(); } } };
}

test('dashboard loops for paid orders; testing and repeated activation never mute the alarm', async () => {
  const h = dashboardHarness();
  await h.run('refreshFeeds()');
  assert.equal(h.element('#arrival-message').textContent, '');
  await h.element('#enable-alerts-button').handlers.click();
  const activationNotes = h.audio.sources.length;
  const order = { ...paid('new'), number: 1, createdAt: new Date().toISOString(), serviceDate: '2099-01-01', slot: '19:00', total: 16.90, items: [], customerName: 'Test' };
  h.context.fetch = async () => ({ ok: true, status: 200, json: async () => ({ orders: [order] }) });
  await h.run('loadOrders()'); h.flush();
  assert.equal(h.audio.sources.length, activationNotes + 1);
  assert.equal(h.audio.sources.at(-1).loop, true);
  assert.equal(h.element('#order-alarm').hidden, false);
  assert.match(h.element('#attention-orders').textContent, /1 commande/);
  assert.match(h.element('#arrival-message').textContent, /commande payée/);
  await h.run('loadOrders()'); h.flush();
  assert.equal(h.audio.sources.length, activationNotes + 1);
  await h.element('#test-sound-button').handlers.click();
  await h.element('#enable-alerts-button').handlers.click();
  assert.equal(h.audio.sources.at(-1).stopped, undefined, 'Neither button stops a pending order');
  assert.equal(h.audio.sources.length, activationNotes + 1, 'Neither button stacks a second alarm');
  h.context.fetch = async () => ({ ok: true, status: 200, json: async () => ({ reservations: [{ id: 'table', number: 1, status: 'pending', serviceDate: '2099-01-01', guests: 2 }] }) });
  await h.run('loadReservations()'); h.flush();
  assert.match(h.element('#arrival-message').textContent, /réservation/);
  assert.match(h.element('#attention-reservations').textContent, /1 réservation/);
  assert.equal(h.audio.sources.length, activationNotes + 1);
  assert.equal(h.audio.sources.at(-1).stopped, undefined);
  assert.equal(h.audio.sources.at(-1).loop, true);
  await h.run('loadReservations()'); h.flush();
  assert.equal(h.audio.sources.length, activationNotes + 1);
});

test('loop is audible PCM without clipping, uses the audio clock, and obeys volume and stop', async () => {
  const samples = alerts.createAlarmSamples(8000);
  assert.equal(samples.length, 64000);
  assert.ok(samples.some(value => Math.abs(value) > 0.6));
  assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) < 1));
  assert.ok(samples.slice(40000).every(value => value === 0), 'A rest between chimes, not a continuous siren');
  const audio = new FakeAudioContext(), player = alerts.createSoundPlayer({ createContext: () => audio });
  assert.equal(player.startAlarm(), false);
  await player.activate();
  assert.equal(player.startAlarm(), true);
  assert.equal(audio.sources[0].loop, true);
  player.startAlarm(); assert.equal(audio.sources.length, 1, 'Repeated polls never stack audio loops');
  player.setVolume(.3); assert.equal(player.state().volume, .3); assert.equal(audio.gains[0].value, .3);
  player.stopAlarm(); assert.equal(audio.sources[0].stopped, true); assert.equal(player.state().ringing, false);
  player.test(); assert.equal(audio.sources[1].loop, false, 'Test is finite, not an actual order');
  player.startAlarm(); assert.equal(audio.sources[1].stopped, true, 'Real order takes over from test');
  player.stop(); assert.equal(audio.sources[2].stopped, true);
});

test('pending paid orders include initial snapshot and cannot be paused, even between arrivals', async () => {
  const audio = new FakeAudioContext(), player = alerts.createSoundPlayer({ createContext: () => audio });
  const alarm = alerts.createOrderAlarm({ player });
  alarm.sync([paid('a'), { ...paid('b'), payment: { status: 'PENDING' } }, paid('c', 'preparing')]);
  assert.equal(alarm.state().count, 1); assert.equal(alarm.state().ringing, false);
  await player.activate(); alarm.refresh(); assert.equal(alarm.state().ringing, true);
  assert.equal(alarm.snooze, undefined); assert.equal(alarm.resume, undefined);
  alarm.sync([paid('a')]); assert.equal(alarm.state().ringing, true);
  alarm.sync([paid('a'), paid('new')]); assert.equal(alarm.state().ringing, true);
  assert.equal(audio.sources.length, 1, 'Polling and arrivals retain one uninterrupted audio loop');
  alarm.resolve('a'); assert.equal(alarm.state().ringing, true);
  alarm.resolve('new'); assert.equal(alarm.state().ringing, false); assert.equal(alarm.state().count, 0);
  alarm.sync([paid('another')]); alarm.reset(); assert.equal(alarm.state().count, 0); assert.equal(alarm.state().ringing, false);
});

test('dashboard does not silence an order until acceptance is saved; errors and session expiry are safe', async () => {
  const h = dashboardHarness(); await h.run('refreshFeeds()');
  await h.element('#enable-alerts-button').handlers.click();
  const order = { ...paid('awaiting'), number: 3, createdAt: new Date().toISOString(), serviceDate: '2099-01-01', total: 16.9, items: [] };
  h.context.fetch = async () => ({ ok: true, status: 200, json: async () => ({ orders: [order] }) });
  await h.run('loadOrders({notify:false})');
  assert.equal(h.run('orderAlarm.state().ringing'), true, 'Existing order sounds even without a fresh-arrival toast');
  let respond;
  h.context.fetch = () => new Promise(resolve => { respond = resolve; });
  const failed = h.run('changeOrder(3, "Acceptée")');
  assert.equal(h.run('orderAlarm.state().ringing'), true, 'Optimistic status change must not stop sound');
  respond({ ok: false, status: 503 }); await failed;
  assert.equal(h.run('orderAlarm.state().ringing'), true);
  const accepted = h.run('changeOrder(3, "Acceptée")');
  respond({ ok: true, status: 200 }); await accepted;
  assert.equal(h.run('orderAlarm.state().ringing'), false);
  h.run('orderAlarm.sync([{id:"again",status:"confirmed",payment:{status:"PAID"}}])');
  h.run('showLogin("Session expirée")');
  assert.equal(h.run('orderAlarm.state().count'), 0); assert.equal(h.run('soundPlayer.state().ringing'), false);
});

test('old mute preference is ignored; suspended browser sound resumes pending alarm on staff gesture', async () => {
  const h = dashboardHarness({ savedSound: 'off' }); await h.run('refreshFeeds()');
  assert.equal(h.element('#audio-warning').hidden, false);
  h.run('orderAlarm.sync([{id:"pending",status:"confirmed",payment:{status:"PAID"}}])');
  await h.element('#enable-alerts-button').handlers.click();
  assert.equal(h.element('#audio-warning').hidden, true); assert.equal(h.run('orderAlarm.state().ringing'), true);
  h.audio.state = 'suspended'; h.audio.onstatechange();
  assert.equal(h.element('#audio-warning').hidden, false); assert.equal(h.run('soundPlayer.state().ringing'), false);
  h.run('unlockServiceSound({})'); await Promise.resolve();
  assert.equal(h.run('orderAlarm.state().ringing'), true);
  assert.equal(h.element('#audio-warning').hidden, true);
  await h.element('#test-sound-button').handlers.click();
  assert.equal(h.run('orderAlarm.state().ringing'), true);
});

test('dashboard exposes only activation, test and nonzero volume, never a mute or pause control', () => {
  const html = fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/index.html'), 'utf8');
  assert.doesNotMatch(html, /id="(?:sound-button|pause-order-alarm)"/);
  assert.match(html, /id="enable-alerts-button"/);
  assert.match(html, /id="test-sound-button"/);
  const h = dashboardHarness();
  assert.equal(h.element('#sound-button').handlers.click, undefined);
  assert.equal(h.element('#pause-order-alarm').handlers.click, undefined);
  const player = alerts.createSoundPlayer({ createContext: null });
  player.setVolume(0); assert.equal(player.state().volume, 0.1);
});

test('dashboard displays separate day, week and month turnover returned by the server', async () => {
  const h = dashboardHarness();
  await h.run('refreshFeeds()');
  h.context.fetch = async () => ({ ok: true, status: 200, json: async () => ({ orders: [], revenue: { today: 12.5, week: 48.9, month: 201 } }) });
  await h.run('loadOrders()');
  assert.equal(h.element('#turnover-today').textContent, '12,50 €');
  assert.equal(h.element('#turnover-week').textContent, '48,90 €');
  assert.equal(h.element('#turnover-month').textContent, '201,00 €');
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
