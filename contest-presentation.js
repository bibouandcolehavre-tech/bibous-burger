// Presentation only. The server remains authoritative for eligibility and points.
const INSTAGRAM_REEL = 'https://www.instagram.com/reel/DeglpQMFPat/';
const INSTAGRAM_PROFILE = 'https://www.instagram.com/bibousburgers/';
const { contestEntry } = require('./contest-entry');
function contestPresentation(contest, participation, now = Date.now()) {
  const entry = contestEntry(contest, now);
  if (!entry) return null;
  const active = contest?.status === 'active' && entry.action === 'Participer au concours';
  const campaign = contest?.id === 'bibou-launch';
  return {
    ...entry, active, campaign, joined: Boolean(participation),
    instagramOpen: campaign && active && now <= Date.parse('2026-12-28T23:59:59+01:00'),
    instagramUrl: now <= Date.parse('2026-10-29T23:59:59+01:00') ? INSTAGRAM_REEL : INSTAGRAM_PROFILE,
    action: participation ? 'Voir mon classement' : active ? 'Je participe au concours' : entry.action,
    prizes: campaign && contest?.firstPrize && contest?.secondPrize && contest?.thirdPrize ? [
      { title: '1re place · 1 an de Bibou', detail: contest.firstPrize },
      { title: '2e place · 6 mois de Bibou', detail: contest.secondPrize },
      { title: '3e place · 2 menus', detail: contest.thirdPrize },
    ] : [],
    referralPoints: Number(contest?.scoring?.pointsPerVerifiedReferral) || 0,
    wheelIncluded: Number(contest?.scoring?.pointsPerAwardedWheelPoint) > 0,
  };
}
function authDestination({ phonePairing, loginDestination, isNewCustomer, preferencesChosen, nativeAccountFirst }) {
  if (phonePairing) return 'kiosk-phone-approval';
  if (loginDestination === 'contest') return 'contest';
  return isNewCustomer || preferencesChosen ? (nativeAccountFirst ? 'notifications-welcome' : 'crm-welcome') : loginDestination;
}
module.exports = { INSTAGRAM_REEL, INSTAGRAM_PROFILE, contestPresentation, authDestination };
