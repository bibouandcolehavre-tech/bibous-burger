/* Read-only on load. A second explicit confirmation is required to award prizes.
   This screen never publishes the contest, activates SMS, or changes a customer. */
window.BibouContestPrizes = function ({ root, api, token, onUnauthorized }) {
  let data = null, busy = false, epoch = 0, prepared = null;
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const q = selector => root.querySelector(selector);
  const message = text => { q('#prize-feedback').textContent = text; };
  root.innerHTML = `<section class="marketing-panel"><h2>Lots du classement · codes mensuels dans l’application</h2><p>Cette rubrique concerne uniquement les trois lots du classement. Codes personnels différents chaque mois, liés au compte gagnant. Les menus mensuels non utilisés sont perdus à la fin du mois, sans report. Menus offerts sans suppléments payants ; frais de livraison éventuels à payer. Le rappel est prévu dix jours avant le dernier jour du mois, s’il reste des menus et avec l’accord du gagnant.</p><p><strong>Bonus Instagram distinct :</strong> un menu valable 30 jours à partir du tirage. Ne pas utiliser les codes mensuels pour ce lot. L’écran des codes de 30 jours reste à adapter dans les applications ; aucune attribution Instagram n’est disponible depuis cette rubrique.</p><p id="prize-feedback" role="status" aria-live="polite"></p><div id="prize-summary"></div><div id="prize-prepare"></div><div id="prize-confirmation"></div><button id="prize-reload" type="button" class="secondary-button">Actualiser les lots</button></section>`;
  function freeze() { root.querySelectorAll('button,input').forEach(el => { el.disabled = busy; }); }
  async function request(route, body) {
    const current = token(), controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(api + route, { method: body ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
        headers: { Authorization: `Bearer ${current}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (current !== token()) throw Error('Session modifiée.');
      if (response.status === 401) { onUnauthorized(); throw Error('Reconnectez-vous.'); }
      const result = await response.json(); if (!response.ok) throw Error(result.error || 'Lots indisponibles.'); return result;
    } finally { clearTimeout(timer); }
  }
  function render() {
    prepared = null; q('#prize-confirmation').innerHTML = '';
    q('#prize-summary').innerHTML = `<p>${data.smsEnabled ? 'Canal SMS configuré ; les consentements individuels restent obligatoires.' : 'SMS de lots non activés. Les codes restent visibles dans l’application ; les notifications dépendent des autorisations.'}</p>${data.grants.map(g => `<p><strong>${g.rank === 1 ? '1re' : `${g.rank}e`} place · ${e(g.customerName)}</strong> — ${g.menus} menu(s), ${g.months} mois (${e(g.startMonth)} → ${e(g.lastMonth)}), ${e(g.status)}.</p>`).join('') || '<p>Aucun lot validé.</p>'}`;
    const p = data.preview;
    if (!p || data.grants.some(g => g.status === 'confirmed')) { q('#prize-prepare').innerHTML = '<p>La validation des gagnants se prépare après la clôture du concours, une seule fois. Aucun gagnant, code ou SMS n’est créé en ouvrant cette page.</p>'; return; }
    if (p.tied) { q('#prize-prepare').innerHTML = '<p>Ex æquo à vérifier : aucune distribution possible depuis cet écran tant que les résultats ne sont pas départagés conformément au règlement.</p>'; return; }
    q('#prize-prepare').innerHTML = `<h3>Résultats à vérifier</h3>${p.winners.map(w => `<p>${w.rank}. ${e(w.customerName || w.alias)} — ${w.score} points.</p>`).join('')}<label>Premier mois complet des lots<input id="prize-first-month" type="month" min="${e(p.minimumStartMonth)}" value="${e(p.minimumStartMonth)}" /></label><h3>Menus éligibles à confirmer</h3>${p.eligibleMenus.map(m => `<label class="inline-check"><input type="checkbox" data-prize-menu="${e(m.id)}" /> ${e(m.name)}</label>`).join('')}<p>${e(data.rules)}</p><button type="button" id="prize-prepare-button" class="secondary-button">Préparer la validation des lots</button>`;
  }
  async function load() {
    if (busy || !token()) return;
    const id = ++epoch; busy = true; freeze(); message('Vérification des lots…');
    try { const result = await request('/dashboard/contest/prizes'); if (id !== epoch) return; data = result; render(); message('Lots chargés. Aucune distribution ni activation effectuée.'); }
    catch (err) { if (id === epoch) message(err.name === 'AbortError' ? 'Connexion trop lente. Réessayez.' : err.message); }
    finally { if (id === epoch) { busy = false; freeze(); } }
  }
  function prepare() {
    if (busy || !data?.preview) return;
    const startMonth = q('#prize-first-month').value, menus = [...root.querySelectorAll('[data-prize-menu]')].filter(input => input.checked).map(input => input.dataset.prizeMenu);
    if (!menus.length || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(startMonth) || startMonth < data.preview.minimumStartMonth) return message('Choisissez un premier mois complet et au moins un menu éligible.');
    prepared = { requestId: crypto.randomUUID(), startMonth, eligibleMenuIds: menus, rankingFingerprint: data.preview.rankingFingerprint };
    q('#prize-confirmation').innerHTML = `<h3>Confirmer les conditions et les résultats</h3><p>À partir de ${e(startMonth)} : 2 menus par mois pendant 12 mois pour la 1re place, 1 menu par mois pendant 6 mois pour la 2e, 2 menus en une seule commande pour la 3e. ${menus.length} menu(s) éligible(s).</p><p>Cette action attribue les lots aux gagnants vérifiés. Elle n’active pas le concours ni le service SMS. Les codes seront créés pendant chaque mois prévu.</p><label>Pour confirmer, saisir exactement VALIDER LES LOTS DU CONCOURS<input id="prize-confirm-text" autocomplete="off" /></label><button id="prize-confirm-button" type="button" class="login-button">Confirmer les lots aux gagnants</button><button id="prize-cancel-button" type="button" class="secondary-button">Annuler cette préparation</button>`;
    message('Préparation privée uniquement. Aucun lot attribué.');
  }
  async function confirm() {
    if (busy || !prepared || q('#prize-confirm-text').value !== 'VALIDER LES LOTS DU CONCOURS') return message('La confirmation exacte est requise avant toute attribution.');
    const id = epoch, input = { ...prepared, confirmation: 'VALIDER LES LOTS DU CONCOURS' }; busy = true; freeze();
    try { const result = await request('/dashboard/contest/prizes/finalize', input); if (id !== epoch) return; data = result; render(); message('Lots validés. Les codes sont réservés aux comptes gagnants, selon les mois confirmés.'); }
    catch (err) { if (id === epoch) message(err.name === 'AbortError' ? 'Réponse trop lente : actualisez les lots avant de confirmer de nouveau.' : err.message); }
    finally { if (id === epoch) { busy = false; freeze(); } }
  }
  root.addEventListener('input', event => { if (event.target.id === 'prize-first-month' || event.target.dataset.prizeMenu) { prepared = null; q('#prize-confirmation').innerHTML = ''; } });
  root.addEventListener('click', event => {
    if (event.target.id === 'prize-reload') void load();
    if (event.target.id === 'prize-prepare-button') prepare();
    if (event.target.id === 'prize-confirm-button') void confirm();
    if (event.target.id === 'prize-cancel-button') { prepared = null; q('#prize-confirmation').innerHTML = ''; message('Préparation annulée, aucun lot attribué.'); }
  });
  return { load, clear() { epoch++; data = prepared = null; busy = false; q('#prize-summary').innerHTML = ''; q('#prize-prepare').innerHTML = ''; q('#prize-confirmation').innerHTML = ''; message(''); freeze(); } };
};
