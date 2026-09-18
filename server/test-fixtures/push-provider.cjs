// Never route a test push to a real provider, even when activation flags are enabled.
if (process.env.NODE_ENV !== 'test') throw Error('Test-only push provider');
global.fetch = async url => {
  throw Error(`Unexpected external request in isolated push test: ${new URL(url).hostname}`);
};
