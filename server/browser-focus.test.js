const test = require('node:test');
const assert = require('node:assert/strict');
const { observeBrowserFocus } = require('../browser-focus');

for (const platform of ['android', 'ios']) {
  test(`${platform}: window exists without browser event methods and does not crash on mount or cleanup`, () => {
    let refreshes = 0;
    const stop = observeBrowserFocus(platform, () => refreshes++, {});
    assert.doesNotThrow(stop);
    assert.equal(refreshes, 0);
  });
}

test('web: returning to a tab refreshes, and unmount removes the listener', () => {
  const listeners = new Map();
  const browserWindow = {
    addEventListener: (event, fn) => listeners.set(event, fn),
    removeEventListener: (event, fn) => { if (listeners.get(event) === fn) listeners.delete(event); },
  };
  let refreshes = 0;
  const stop = observeBrowserFocus('web', () => refreshes++, browserWindow);
  assert.equal(refreshes, 0);
  listeners.get('focus')();
  assert.equal(refreshes, 1);
  stop();
  assert.equal(listeners.size, 0);
});

test('web pre-render without a browser remains safe', () => {
  assert.doesNotThrow(() => observeBrowserFocus('web', () => {}, null)());
});
