if (process.env.NODE_ENV !== 'test') throw Error('Test fixture only');
require('./sumup-provider.cjs');
const providerFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  if (new URL(url).hostname === 'verify.twilio.com') {
    const body = new URLSearchParams(options.body);
    return Response.json({ status: body.get('Code') === '123456' ? 'approved' : 'pending' });
  }
  return providerFetch(url, options);
};
