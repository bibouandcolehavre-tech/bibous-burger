// Common next release: including the screen does not activate the contest.
// Participation remains governed by the server's closed/published state.
const supportsNewCustomerJourneys = platform => ['web', 'android', 'ios'].includes(platform);
const supportsRankingContest = platform => ['web', 'android', 'ios'].includes(platform);
const supportsCustomerJourneyShell = platform => ['android', 'ios'].includes(platform);

module.exports = { supportsNewCustomerJourneys, supportsRankingContest, supportsCustomerJourneyShell };
