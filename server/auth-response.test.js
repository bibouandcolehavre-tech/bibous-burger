const test = require('node:test');
const assert = require('node:assert/strict');
const { readAuthResponse, TEMPORARY_AUTH_ERROR } = require('../auth-response');

test('SMS authentication preserves a JSON error from the API', async () => {
  const response = new Response(JSON.stringify({ error: 'Trop de tentatives.' }), {
    status: 429,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
  assert.deepEqual(await readAuthResponse(response), { error: 'Trop de tentatives.' });
});

test('SMS authentication does not expose an HTML gateway response as a JSON parsing error', async () => {
  const response = new Response('<html>Bad Gateway</html>', {
    status: 502,
    headers: { 'content-type': 'text/html' },
  });
  await assert.rejects(readAuthResponse(response), { message: TEMPORARY_AUTH_ERROR });
});

test('SMS authentication handles malformed JSON without technical details', async () => {
  const response = new Response('{', {
    status: 503,
    headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(readAuthResponse(response), { message: TEMPORARY_AUTH_ERROR });
});
