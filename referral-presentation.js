// Display only server-published rewards. No contacts permission or address-book upload.
const {contestEntry}=require('./contest-entry');
function referralPresentation(data, now=Date.now()) {
  const contest = data?.contest;
  if (contest?.status !== 'active') return null;
  if (contestEntry(contest,now)?.action!=='Participer au concours') return null;
  const sponsorPoints = contest.scoring?.pointsPerVerifiedReferral;
  if (!Number.isSafeInteger(sponsorPoints) || sponsorPoints <= 0) return null;
  const inviteePoints = Number.isSafeInteger(contest.scoring?.pointsPerVerifiedInvitee) ? contest.scoring.pointsPerVerifiedInvitee : 0;
  return { sponsorPoints, inviteePoints, both:inviteePoints === sponsorPoints,
    reward:inviteePoints === sponsorPoints ? `${sponsorPoints} points chacun au classement` : `${sponsorPoints} points pour toi au classement`,
    joined:Boolean(data.participation), inviteeBonus:Math.max(0, data.participation?.inviteePoints || 0) };
}
function referralMessage({url, code, inviteePoints = 0}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !['bibous-burger-app.onrender.com','bibousburgers.com','www.bibousburgers.com'].includes(parsed.hostname)) throw Error('Lien de parrainage invalide.');
  return `Je t’invite au concours Bibou’s Burgers ! Crée ton compte, vérifie ton numéro et inscris-toi au concours avec mon code ${code}.${inviteePoints > 0 ? ` Tu recevras ${inviteePoints} points au classement et moi aussi !` : ''} Aucun achat obligatoire. ${parsed.href}`;
}
// Called synchronously from the tap so Web Share keeps its user activation.
async function shareReferral({platform, navigator, nativeShare, url, code, inviteePoints = 0}) {
  const message = referralMessage({url,code,inviteePoints});
  try {
    if (platform !== 'web') { const result=await nativeShare({title:'Bibou’s Burgers · Parrainage',message}); return {status:result?.action==='dismissedAction'?'cancelled':'opened'}; }
    if (typeof navigator?.share === 'function') { await navigator.share({title:'Bibou’s Burgers · Parrainage',text:message}); return {status:'opened'}; }
    if (typeof navigator?.clipboard?.writeText === 'function') { await navigator.clipboard.writeText(message); return {status:'copied'}; }
    return {status:'unsupported'};
  } catch(error) { if (error?.name === 'AbortError') return {status:'cancelled'}; throw error; }
}
module.exports = {referralPresentation,referralMessage,shareReferral};
