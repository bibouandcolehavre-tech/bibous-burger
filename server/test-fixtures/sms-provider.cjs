// Only for isolated automated tests. Never forwards a provider request.
if (process.env.NODE_ENV !== 'test') throw new Error('Test provider requires NODE_ENV=test');
global.fetch = async (url, options = {}) => {
  if (!String(url).startsWith('https://verify.twilio.com/')) throw new Error('External network disabled by SMS test provider');
  if (String(url).endsWith('/Verifications')) return new Response(JSON.stringify({ status: 'pending' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  const approved = new URLSearchParams(options.body).get('Code') === '123456';
  return new Response(JSON.stringify({ status: approved ? 'approved' : 'denied' }), { status: approved ? 200 : 400, headers: { 'Content-Type': 'application/json' } });
};
