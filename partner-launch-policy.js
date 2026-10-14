const shouldShowPartnerLaunch = (platform, initialScreen) =>
  platform === 'android' || (platform === 'web' && initialScreen === 'menu');

module.exports = { shouldShowPartnerLaunch };
