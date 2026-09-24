const isReviewToken = token => typeof token === 'string' && token.startsWith('review.');
const reviewApiBase = (base, token) => isReviewToken(token) ? `${base}/review` : base;
// No global fetch override, no query-string switch, and no production fallback.
function createCustomerFetch(base, transport) {
  return (url, options = {}) => {
    const authorization = options.headers?.Authorization || options.headers?.authorization || '';
    if (isReviewToken(authorization.replace(/^Bearer /, ''))) {
      if (typeof url !== 'string' || !url.startsWith(`${base}/`)) throw new Error('Destination de test non autorisée.');
      const route = url.slice(base.length);
      if (route.includes('..') || route.includes('\\') || route.includes('%')) throw new Error('Route de test invalide.');
      url = `${base}/review${route}`;
    }
    return transport(url, options);
  };
}
module.exports = { isReviewToken, reviewApiBase, createCustomerFetch };
