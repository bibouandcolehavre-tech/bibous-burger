// Loaded ONLY by payments-http.test.js via node --require. It replaces fetch in
// an isolated child process with a fake provider; no network or real secrets.
const fs = require('node:fs/promises');
const path = require('node:path');
if (process.env.NODE_ENV !== 'test' || !process.env.FAKE_SUMUP_FILE) throw new Error('Test fixture only');
global.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  if (parsed.hostname !== 'api.sumup.com') throw new Error('External network forbidden in payment tests');
  const file = process.env.FAKE_SUMUP_FILE;
  const state = JSON.parse(await fs.readFile(file, 'utf8'));
  await fs.appendFile(path.join(path.dirname(file), 'calls.jsonl'), JSON.stringify({ path: parsed.pathname, query: parsed.search, method: options.method || 'GET' }) + '\n');
  if (state.delayMs) await new Promise(resolve => setTimeout(resolve, state.delayMs));
  if (state.fail) return new Response('{}', { status: 503 });
  if (options.method === 'POST' && parsed.pathname === '/v0.1/checkouts') {
    const body = JSON.parse(options.body);
    const id = `fake-${Object.keys(state.checkouts).length + 1}`;
    const checkout = { ...body, id, status: 'PENDING', hosted_checkout_url: `https://checkout.sumup.com/pay/${id}` };
    state.checkouts[id] = checkout;
    await fs.writeFile(file, JSON.stringify(state));
    if (state.loseCreationResponse) throw new Error('Simulated lost response after successful creation');
    return Response.json(checkout);
  }
  if (parsed.pathname === '/v0.1/checkouts') return Response.json(Object.values(state.checkouts).filter(item => item.checkout_reference === parsed.searchParams.get('checkout_reference')));
  const checkout = state.checkouts[parsed.pathname.split('/').pop()];
  return checkout ? Response.json(checkout) : new Response('{}', { status: 404 });
};
