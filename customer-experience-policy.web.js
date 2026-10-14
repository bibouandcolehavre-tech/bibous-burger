// Metro resolves this file only for the website. The signed native candidates
// retain their existing policy and the same shared customer screen components.
const nativePolicy = require('./customer-experience-policy.js');
module.exports = {
  ...nativePolicy,
  supportsCustomerJourneyShell: platform => ['web', 'android', 'ios'].includes(platform),
};
