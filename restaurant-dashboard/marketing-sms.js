window.BibouMarketingSms = function ({ root, api, token, onUnauthorized }) {
  let state = null, preview = null, requestId = null, busy = false, epoch = 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  root.innerHTML = `<div class="marketing-intro"><p class="eyebrow">SMS COMMERCIAUX</p><h2>Vos offres, directement par SMS.</h2><p>Pour les clients qui ont accepté les SMS promotionnels. Ce choix est distinct des offres personnalisées et des SMS de connexion.</p></div><p id="sms-feedback" role="status" aria-live="polite"></p><div id="sms-status" class="push-status"></div>
  <div class="push-layout"><section class="marketing-panel"><h2>1. Préparer le SMS</h2><form id="sms-form"><label>Nom interne de la campagne<input name="title" maxlength="65" required placeholder="Offre du week-end" /></label><label>Texte du SMS<textarea name="body" rows="4" maxlength="220" required placeholder="Votre offre et ses conditions…"></textarea></label><label>Destinataires<select name="audience"><option value="all">Clients ayant accepté les SMS commerciaux</option><option value="plus">Abonnés Bibou + ayant accepté les SMS commerciaux</option></select></label><p class="push-muted">Le nom Bibou et le lien STOP sont ajoutés automatiquement. L’aperçu n’envoie rien. Les SMS sont payants selon votre tarif Twilio ; accents, longueur et emoji peuvent multiplier les segments facturables.</p><button class="login-button" type="submit">2. Vérifier le SMS et les destinataires</button></form></section><section class="marketing-panel"><h2>Aperçu du SMS</h2><div class="push-phone"><strong>Bibou’s Burgers</strong><p id="sms-copy">Votre message apparaîtra ici.</p></div><div id="sms-confirmation" hidden><h3>3. Confirmer l’envoi payant</h3><p id="sms-audience"></p><label class="inline-check"><input id="sms-consent" type="checkbox" /> J’accepte cet envoi et la facturation Twilio du nombre maximal de segments indiqué.</label><button id="sms-send" class="login-button" type="button" disabled>Envoyer les SMS</button><p class="push-muted" id="sms-help"></p></div></section></div>
  <section class="marketing-panel"><h2>Historique des 30 derniers jours</h2><p>Accepté par Twilio ne signifie pas livré ou lu. Un résultat incertain n’est jamais relancé automatiquement pour éviter une double facturation.</p><div id="sms-history"></div></section><section class="marketing-panel"><h2>Votre cadre d’envoi</h2><p>De 10 h à 20 h, heure de Paris, du lundi au samedi, hors jours fériés nationaux. Deux campagnes par 24 heures, 100 clients maximum par campagne. Désinscription possible depuis chaque SMS et dans Mon compte → Mes offres.</p><p>Ces SMS sont à sens unique : le client ne peut pas répondre à l’expéditeur Bibou. Les campagnes ne créent pas de code promo ; préparez votre offre dans Codes promo avant de l’annoncer.</p></section>`;
  const q = selector => root.querySelector(selector);
  const message = text => { q('#sms-feedback').textContent = text; };
  const fields = () => Object.fromEntries(new FormData(q('#sms-form')));
  function updateSend() {
    const reason = !state?.connection.enabled ? 'Connexion Twilio à finaliser : aucun envoi possible.' : !preview ? 'Préparez un aperçu.' : preview.status !== 'draft' ? 'Cet envoi est déjà enregistré.' : preview.expiresAt <= Date.now() ? 'Aperçu expiré : vérifiez de nouveau.' : !preview.customers ? 'Aucun destinataire avec accord SMS.' : !state.allowedNow ? 'Hors horaires d’envoi : actualisez pendant les heures autorisées.' : !q('#sms-consent').checked ? 'Cochez la confirmation de facturation avant l’envoi.' : '';
    q('#sms-send').disabled = busy || !!reason; q('#sms-help').textContent = reason || 'Prêt à envoyer. Un SMS transmis ne peut pas être rappelé.';
  }
  const freeze = value => { busy = value; root.querySelectorAll('button,input,textarea,select').forEach(el => { el.disabled = value; }); updateSend(); };
  async function request(path, body) {
    const auth = token(), r = await fetch(api + '/dashboard/marketing-sms' + path, { method: body ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (token() !== auth) throw Error('Session modifiée.');
    if (r.status === 401) { onUnauthorized(); throw Error('Reconnectez-vous.'); }
    const data = await r.json().catch(() => { throw Error('Réponse serveur invalide. Actualisez pour vérifier le résultat.'); });
    if (!r.ok) throw Error(data.error || 'SMS indisponibles.'); return data;
  }
  function render() {
    q('#sms-status').innerHTML = `<strong>${state.connection.enabled ? 'SMS commerciaux activés' : 'Préparation disponible · envoi SMS non activé'}</strong><p>${state.connection.enabled ? 'Chaque envoi nécessite votre confirmation de facturation.' : state.connection.missing.map(esc).join(' · ')}</p><div class="marketing-stats"><p><strong>${state.optedInCustomers}</strong> client(s) ont accepté les SMS</p><p><strong>${state.eligibleCustomers}</strong> mobile(s) français joignable(s)</p></div><p class="push-muted">${state.allowedNow ? 'Horaire d’envoi autorisé actuellement.' : 'Envois fermés à cette heure ; la préparation reste disponible.'} Aucun ancien accord marketing n’est transformé en accord SMS.</p>`;
    q('#sms-history').innerHTML = state.campaigns.length ? state.campaigns.map(c => `<article class="push-history-item"><strong>${esc(c.title)}</strong><p>${esc(c.body)}</p><small>${c.status === 'draft' ? 'Aperçu uniquement · aucun SMS envoyé' : `${c.customers} client(s) · ${c.counts.queued + c.counts.sending} en attente · ${c.counts.accepted} accepté(s) par Twilio · ${c.counts.delivered} livré(s) · ${c.counts.failed} échec(s) · ${c.counts.uncertain} incertain(s) · ${c.counts.cancelled + c.counts.expired} annulé(s)/expiré(s)`}</small></article>`).join('') : '<p>Aucune campagne SMS enregistrée.</p>';
    updateSend();
  }
  function invalidate() { preview = requestId = null; q('#sms-consent').checked = false; q('#sms-confirmation').hidden = true; q('#sms-copy').textContent = `Bibou's Burgers : ${fields().body || 'Votre message'}\nSTOP : ${state?.sampleStopUrl || '[lien personnel de désinscription]'}`; updateSend(); }
  q('#sms-form').addEventListener('input', invalidate); q('#sms-form').addEventListener('change', invalidate); q('#sms-consent').addEventListener('change', updateSend);
  q('#sms-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; const generation = epoch;
    if (preview && (preview.status !== 'draft' || preview.expiresAt <= Date.now())) requestId = null;
    requestId ||= crypto.randomUUID(); const input = { ...fields(), requestId }; freeze(true); message('Vérification sans envoi…');
    try { const result = await request('/preview', input); if (generation !== epoch) return; state = result; preview = result.campaign; q('#sms-confirmation').hidden = false; q('#sms-consent').checked = false; q('#sms-audience').textContent = `${preview.customers} client(s) · ${preview.segmentsPerMessage} segment(s) par SMS · au maximum ${preview.maxSegments} segments facturables. Le prix unitaire est celui de votre compte Twilio ; il n’est pas estimé ici. Aperçu valable 15 minutes.`; render(); message('Aperçu préparé. Aucun SMS envoyé.'); q('#sms-confirmation').scrollIntoView?.({ behavior: 'smooth', block: 'center' }); }
    catch (e) { if (generation === epoch) message(e.message); } finally { if (generation === epoch) freeze(false); }
  });
  q('#sms-send').addEventListener('click', async () => {
    updateSend(); if (q('#sms-send').disabled) return; const generation = epoch, id = preview.id, maxSegments = preview.maxSegments;
    freeze(true); message('Mise en file…');
    try { const result = await request(`/campaigns/${id}/send`, { confirm: true, maxSegments }); if (generation !== epoch) return; state = result; preview = result.campaign; q('#sms-consent').checked = false; render(); message('Envoi enregistré. Consultez l’historique de livraison.'); }
    catch (e) { if (generation === epoch) message(e.message + ' Actualisez avant de recommencer : un résultat incertain ne doit pas être renvoyé.'); } finally { if (generation === epoch) freeze(false); }
  });
  async function load() {
    if (busy || !token()) return; const generation = epoch; freeze(true);
    try { const result = await request(''); if (generation !== epoch) return; state = result; if (preview) preview = state.campaigns.find(c => c.id === preview.id) || preview; render(); invalidateCopy(); }
    catch (e) { if (generation === epoch) message(e.message); } finally { if (generation === epoch) freeze(false); }
  }
  function invalidateCopy() { q('#sms-copy').textContent = `Bibou's Burgers : ${fields().body || 'Votre message'}\nSTOP : ${state?.sampleStopUrl || '[lien personnel de désinscription]'}`; }
  function clear() { epoch++; state = preview = requestId = null; q('#sms-form').reset(); invalidate(); q('#sms-status').textContent = ''; q('#sms-history').textContent = ''; message(''); freeze(false); }
  return { load, clear };
};
