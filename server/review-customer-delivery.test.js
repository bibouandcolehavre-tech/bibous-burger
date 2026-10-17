'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createReviewSandbox } = require('./review-sandbox');
const { BIBOU_PLUS_PRICE } = require('../bibou-plus-offer');
const code = 'local-only-customer-delivery-review-test';
const accessHash = crypto.createHash('sha256').update(code).digest('hex');
const now = Date.parse('2026-10-17T10:00:00Z');
const make = () => createReviewSandbox({ accessHash, now: () => now });
const req = (s, route, token, body, method = body === undefined ? 'GET' : 'POST') => s.handle({ method, route, token, readBody: async () => body });
const login = s => req(s, '/session', '', { accessCode: code });

test('customer review delivery: sample course, fresh illustrated map and no personal GPS', async () => {
  const s = make(), a = await login(s), orders = (await req(s, '/customer/orders', a.token)).orders;
  assert(orders.some(o => o.id === 'review-delivery-moving' && o.status === 'out_for_delivery'));
  assert(orders.some(o => o.id === 'review-delivery-completed' && o.status === 'delivered'));
  const map = await req(s, '/customer/orders/review-delivery-moving/delivery-tracking', a.token);
  assert.equal(map.reviewMode, true); assert.equal(map.protocol, 'bibou-customer-delivery-v1');
  assert.equal(map.position.validForMs, 10000); assert.equal(map.timing.remainingMinutes, 5);
  assert.equal((await req(s, '/customer/orders/review-delivery-completed/delivery-tracking', a.token)).position, null);
  await assert.rejects(req(s, '/customer/orders/unrelated/delivery-tracking', a.token), e => e.statusCode === 404);
});

test('customer review delivery: ratings and simulated tips are isolated, replay-safe and provider-free', async () => {
  const s = make(), a = await login(s), b = await login(s), base = '/customer/orders/review-delivery-completed';
  const empty = await req(s, base + '/delivery-feedback', a.token);
  assert.equal(empty.eligible, true); assert.equal(empty.tips.simulated, true); assert.equal(empty.tips.enabled, true);
  const rating = { stars: 4, comment: 'Avis fictif' };
  await req(s, base + '/delivery-feedback', a.token, rating);
  assert.equal((await req(s, base + '/delivery-feedback', a.token, rating)).feedback.stars, 4);
  assert.equal((await req(s, base + '/delivery-feedback', b.token)).feedback, null);
  const input = { amountCents: 200, requestId: crypto.randomUUID() };
  const tip = await req(s, base + '/tip', a.token, input);
  assert.equal(tip.status, 'PAID'); assert.equal(tip.simulated, true); assert.equal(tip.checkoutUrl, null);
  assert.equal((await req(s, base + '/tip', a.token, input)).id, tip.id);
  assert.equal((await req(s, base + '/tip', b.token)).status, undefined);
  for (const bad of [{...input, amountCents: 1}, {...input, amountCents: 5001}, {...input, providerVerified: true}]) await assert.rejects(req(s, base + '/tip', a.token, bad));
  await assert.rejects(req(s, '/customer/orders/review-delivery-moving/tip', a.token, input), e => e.statusCode === 409);
  assert.equal((await req(s, '/auth/me', a.token)).customer.points, 1500);
  await req(s, '/customer/account', a.token, undefined, 'DELETE');
  await assert.rejects(req(s, base + '/tip', a.token), e => e.statusCode === 401);
  assert.equal((await req(s, base + '/tip', b.token)).status, undefined);
});

test('customer review Bibou Plus matches the current 5.99 euro one-off offer', async () => {
  const s = make(), a = await login(s);
  const result = await req(s, '/bibou-plus/checkout', a.token, { requestId: crypto.randomUUID() });
  assert.equal(BIBOU_PLUS_PRICE, 5.99); assert.equal(result.purchase.amount, 5.99); assert.equal(result.reviewMode, undefined);
  assert.equal(result.purchase.reviewMode, true);
});
