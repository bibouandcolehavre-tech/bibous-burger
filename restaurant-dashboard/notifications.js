window.BibouNotifications = function ({ root, api, token, onUnauthorized }) {
  let state = null, preview = null, busy = false, epoch = 0, requestId = null;
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const destinations = { menu: 'La carte', loyalty: 'Club Bibou', 'bibou-plus': 'Bibou +', reservation: 'Réserver une table' };
  root.innerHTML = `<div class="marketing-intro"><p class="eyebrow">GARDER LE LIEN</p><h2>Un message, au bon moment.</h2><p>Les commandes et réservations ont leurs alertes automatiques. Ici, préparez vos promotions pour les clients qui les ont acceptées.</p></div>
    <p id="push-feedback" role="status" aria-live="polite"></p><div id="push-status" class="push-status"></div>
    <div class="push-layout"><section class="marketing-panel"><h2>Préparer une notification</h2><form id="push-form"><label>Titre<input name="title" maxlength="65" required placeholder="Le burger du mois est arrivé 🍔" /></label><label>Message<textarea name="body" maxlength="220" rows="4" required placeholder="Présentez votre actualité en quelques mots…"></textarea></label><div class="marketing-grid"><label>Destinataires<select name="audience"><option value="all">Tous les clients ayant accepté les promotions</option><option value="plus">Abonnés Bibou + ayant accepté les promotions</option></select></label><label>Au clic, ouvrir<select name="screen">${Object.entries(destinations).map(([key,label]) => `<option value="${key}">${label}</option>`).join('')}</select></label></div><p class="push-muted">Ni SMS ni publicité automatique. Maximum deux campagnes par 24 heures. L’aperçu n’envoie rien.</p><button class="login-button" type="submit">Vérifier les destinataires</button></form></section>
    <section class="marketing-panel"><h2>Aperçu sur téléphone</h2><div class="push-phone" aria-label="Aperçu de la notification"><div class="push-phone-top"><span>BIBOU’S BURGERS</span><span>maintenant</span></div><strong id="push-preview-title">Votre titre</strong><p id="push-preview-body">Votre message apparaîtra ici.</p></div><div id="push-confirmation" hidden><p id="push-audience"></p><label class="inline-check"><input id="push-consent" type="checkbox" /> Je confirme cet envoi aux clients indiqués.</label><button id="push-send" type="button" class="login-button" disabled>Envoyer la notification</button><p class="push-muted">Une notification déjà transmise ne peut pas être rappelée. Les retraits de consentement sont revérifiés avant l’envoi.</p></div></section></div>
    <section class="marketing-panel"><h2>Historique des 7 derniers jours</h2><p>« Transmis à Apple/Google » ne signifie pas « lu ». Internet et les réglages du téléphone peuvent empêcher la réception.</p><div id="push-history"></div></section>
    <section class="marketing-panel"><h2>Suivi automatique</h2><p>Commande transmise après paiement vérifié, acceptée, prête, en livraison, terminée ou annulée ; table confirmée ou annulée. Uniquement pour les clients ayant activé ce suivi.</p><p>Les messages ne contiennent ni adresse, ni téléphone, ni détail de paiement. Les anciens changements de statut ne sont pas envoyés rétroactivement.</p></section>`;
  const q = selector => root.querySelector(selector);
  const message = value => { q('#push-feedback').textContent = value; };
  const fields = () => Object.fromEntries(new FormData(q('#push-form')));
  const freeze = value => { busy = value; root.querySelectorAll('button,input,textarea,select').forEach(el => { el.disabled = value; }); updateSend(); };
  const updateSend = () => { q('#push-send').disabled = busy || !preview || !q('#push-consent').checked || !state?.enabled || !state.platforms.length || !preview.devices || preview.status !== 'draft' || preview.previewExpiresAt <= Date.now(); };
  async function request(path, body) {
    const auth = token();
    const response = await fetch(api + '/dashboard/push' + path, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(12000), cache: 'no-store', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (token() !== auth) throw new Error('Session modifiée.');
    if (response.status === 401) { onUnauthorized(); throw new Error('Reconnectez-vous.'); }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Notifications indisponibles.');
    return payload;
  }
  function renderState() {
    if (!state) return;
    const platforms = state.platforms.map(p => p === 'ios' ? 'iPhone' : 'Android').join(' et ');
    q('#push-status').innerHTML = `<strong>${state.enabled && platforms ? `Envois activés : ${e(platforms)}` : 'Préparation prête · envois sur téléphone non activés'}</strong><p>${state.enabled && platforms ? 'Les alertes utilisent uniquement les téléphones associés et autorisés.' : 'La connexion Apple/Google et un test sur la version installable restent nécessaires. Vous pouvez préparer et prévisualiser vos messages, sans envoi réel.'}</p><div class="marketing-stats"><p><strong>${state.optedInCustomers}</strong> clients ayant accepté les promotions</p><p><strong>${state.registeredDevices}</strong> appareils associés</p><p><strong>${state.eligibleCustomers}</strong> clients joignables actuellement</p></div>`;
    q('#push-history').innerHTML = state.campaigns.length ? state.campaigns.map(c => `<article class="push-history-item"><div><strong>${e(c.title)}</strong><span>${new Date(c.createdAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</span></div><p>${e(c.body)}</p><small>${c.status === 'draft' ? 'Aperçu seulement · aucun envoi' : `${c.customers} client(s) · ${c.counts.queued + c.counts.sending} en attente · ${c.counts.accepted} confié(s) à Expo · ${c.counts.provider_ok} transmis à Apple/Google · ${c.counts.failed} échec(s) · ${c.counts.uncertain} résultat(s) incertain(s) · ${c.counts.cancelled + c.counts.expired} annulé(s)/expiré(s)`}</small></article>`).join('') : '<p>Aucun envoi ni aperçu enregistré pour le moment.</p>';
    updateSend();
  }
  function invalidate() {
    preview = null; requestId = null; q('#push-consent').checked = false; q('#push-confirmation').hidden = true;
    const input = fields(); q('#push-preview-title').textContent = input.title || 'Votre titre'; q('#push-preview-body').textContent = input.body || 'Votre message apparaîtra ici.';
    updateSend();
  }
  q('#push-form').addEventListener('input', invalidate);
  q('#push-form').addEventListener('change', invalidate);
  q('#push-consent').addEventListener('change', updateSend);
  q('#push-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const input = fields(), generation = epoch;
    if (preview && (preview.status !== 'draft' || preview.previewExpiresAt <= Date.now())) requestId = null;
    requestId ||= crypto.randomUUID(); freeze(true); message('Vérification, sans envoi…');
    try {
      state = await request('/preview', { ...input, requestId });
      if (generation !== epoch) return;
      preview = state.campaign; q('#push-confirmation').hidden = false; q('#push-consent').checked = false;
      q('#push-audience').textContent = `${preview.customers} client(s), ${preview.devices} téléphone(s) autorisé(s). Au clic : ${destinations[preview.screen]}. Aperçu valable 15 minutes.`;
      renderState(); message('Aperçu vérifié. Aucune notification envoyée.');
    } catch (error) { if (generation === epoch) message(error.message); }
    finally { if (generation === epoch) freeze(false); }
  });
  q('#push-send').addEventListener('click', async () => {
    if (busy || !preview || !q('#push-consent').checked) return;
    const id = preview.id, generation = epoch;
    freeze(true); message('Mise en file d’envoi…');
    try {
      state = await request(`/campaigns/${id}/send`, { confirm: true });
      if (generation !== epoch) return;
      preview = state.campaign; q('#push-consent').checked = false; renderState();
      message('Notification mise en file. L’historique affiche sa transmission, pas sa lecture.');
    } catch (error) { if (generation === epoch) message(`${error.message} En cas de coupure, Actualiser permet de vérifier le résultat ; recommencer avec ce même aperçu ne crée pas un second envoi.`); }
    finally { if (generation === epoch) freeze(false); }
  });
  async function load() {
    if (busy || !token()) return;
    const generation = epoch; freeze(true);
    try { const result = await request(''); if (generation !== epoch) return; state = result; if (preview) preview = state.campaigns.find(c => c.id === preview.id) || preview; renderState(); }
    catch (error) { if (generation === epoch) message(error.message); }
    finally { if (generation === epoch) freeze(false); }
  }
  function clear() { epoch += 1; state = preview = requestId = null; q('#push-form').reset(); invalidate(); q('#push-status').textContent = ''; q('#push-history').textContent = ''; message(''); freeze(false); }
  return { load, clear };
};
