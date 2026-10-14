// The new journeys are approved for the web and Android. The ranking contest
// has a separate launch decision and is deliberately not part of Android.
const supportsNewCustomerJourneys = platform => platform === 'web' || platform === 'android';
const supportsRankingContest = platform => platform !== 'android';

module.exports = { supportsNewCustomerJourneys, supportsRankingContest };
