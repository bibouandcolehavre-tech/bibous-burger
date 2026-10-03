const WEB_APP = 'https://bibous-burger-app.onrender.com/';
const INSTALL_PAGE = 'https://bibous-burger-app.onrender.com/app';

// Squarespace forwards the original path to this server. All former shop URLs
// keep leading to the menu, while the new /app QR code gets its own page.
function destinationForLegacyPath(pathname, method) {
  if (method !== 'GET' && method !== 'HEAD') return null;
  if (pathname === '/api' || pathname.startsWith('/api/') || pathname === '/s' || pathname.startsWith('/s/')) return null;
  return /^\/app\/?$/.test(pathname) ? INSTALL_PAGE : WEB_APP;
}

module.exports = { destinationForLegacyPath };
