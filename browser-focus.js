// React Native defines `window`, but it does not provide browser focus events.
// Native foreground changes are already handled through AppState.
function observeBrowserFocus(platform, onFocus, browserWindow = globalThis.window) {
  if (platform !== 'web' || typeof browserWindow?.addEventListener !== 'function' || typeof browserWindow?.removeEventListener !== 'function') {
    return () => {};
  }
  browserWindow.addEventListener('focus', onFocus);
  return () => browserWindow.removeEventListener('focus', onFocus);
}

module.exports = { observeBrowserFocus };
