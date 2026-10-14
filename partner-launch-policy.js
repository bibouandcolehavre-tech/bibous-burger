const shouldShowPartnerLaunch = (platform, initialScreen) =>
  ['android', 'ios'].includes(platform) || (platform === 'web' && initialScreen === 'menu');

module.exports = { shouldShowPartnerLaunch };
