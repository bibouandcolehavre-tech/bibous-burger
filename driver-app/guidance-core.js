(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KrokliGuidanceCore = api;
})(typeof window === 'undefined' ? globalThis : window, function() {
  'use strict';
  const PROVIDERS = ['google', 'apple', 'waze'];
  function preferredProvider(value, appleMobile = false) {
    return PROVIDERS.includes(value) ? value : appleMobile ? 'apple' : 'google';
  }
  // Only the current stop is passed in. No account, order identifier, customer
  // name/phone, origin fix or session token is sent to the navigation provider.
  function externalLinks(target) {
    if (typeof target?.address !== 'string') return null;
    const address = target.address.trim();
    if (!address || address.length > 500 || /[\u0000-\u001f\u007f]/.test(address)) return null;
    const p = target.coordinates;
    if (p !== undefined && (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) return null;
    const destination = encodeURIComponent(p ? `${p[1]},${p[0]}` : address);
    return {
      google: `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving&dir_action=navigate`,
      apple: `https://maps.apple.com/?daddr=${destination}&dirflg=d`,
      waze: `https://waze.com/ul?${p ? 'll' : 'q'}=${destination}&navigate=yes&utm_source=krokli_driver`,
    };
  }
  return { externalLinks, preferredProvider };
});
