/* Daily openings use the server's exact slots and preserve existing bookings. */
(function (global) {
  const names = { pickup: 'Retrait', delivery: 'Livraison', reservation: 'Tables' };
  const periods = { lunch: ['Midi', 12, 15], evening: ['Soir', 18, 24], other: ['Autres heures', 0, 24] };
  const inPeriod = (slot, period) => {
    const hour = Number(slot.slice(0, 2));
    return period === 'other' ? hour < 12 || (hour >= 15 && hour < 18) : hour >= periods[period][1] && hour < periods[period][2];
  };
  const makeDraft = data => Object.fromEntries(Object.entries(data.services).map(([key, rows]) => [key, Object.fromEntries(rows.map(row => [row.slot, row.open]))]));
  const changes = (data, draft) => data ? Object.entries(data.services).flatMap(([method, rows]) => rows.filter(row => row.open !== draft[method][row.slot]).map(row => ({ ...row, method, nextOpen: draft[method][row.slot] }))) : [];
  const impacts = (data, draft) => changes(data, draft).filter(row => !row.nextOpen && row.committed > 0);
  if (typeof module === 'object' && module.exports) module.exports = { inPeriod, makeDraft, changes, impacts };
  if (!global) return;

  global.BibouSchedule = function ({ root, api, token, onUnauthorized }) {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const tomorrow = () => { const next = new Date(today() + 'T12:00:00Z'); next.setUTCDate(next.getUTCDate() + 1); return next.toISOString().slice(0, 10); };
    let date = today(), data = null, draft = null, method = 'pickup', period = 'lunch', busy = false, epoch = 0, reviewing = false;

    root.innerHTML = `<div class="schedule-intro"><h2>Ouvrir ou fermer un créneau</h2><p>Touchez une heure pour la rendre <strong>ouverte</strong> ou <strong>fermée</strong>, puis enregistrez.</p></div>
      <div class="planner-controls"><div><strong>Quel jour ?</strong><div class="planner-quick-days"><button type="button" id="schedule-today">Aujourd’hui</button><button type="button" id="schedule-tomorrow">Demain</button></div></div><label for="schedule-date">Ou choisissez une date<input type="date" id="schedule-date"></label></div>
      <div class="planner-methods" aria-label="Choisir ce que vous ouvrez ou fermez"><button type="button" data-schedule-method="pickup"><span>🛍️</span><strong>Retrait</strong><small>Click & collect</small></button><button type="button" data-schedule-method="delivery"><span>🛵</span><strong>Livraison</strong><small>Commandes livrées</small></button><button type="button" data-schedule-method="reservation"><span>🍽️</span><strong>Tables</strong><small>Réservations</small></button></div>
      <div class="planner-segment" aria-label="Choisir le moment"><button type="button" data-period="lunch">☀️ Midi</button><button type="button" data-period="evening">🌙 Soir</button><button type="button" data-period="other">Autres heures</button></div>
      <p id="schedule-message" role="status" aria-live="polite"></p>
      <div id="schedule-editor" hidden><section class="workspace-panel planner-simple"><div class="workspace-heading"><h3 id="planner-title"></h3><span class="planner-legend">Touchez une heure pour changer</span></div><div id="schedule-slots" class="planner-slots"></div>
      <div class="planner-bulk"><button type="button" id="schedule-close-period">Tout fermer pour ce moment</button><button type="button" id="schedule-open-period">Ouvrir les horaires habituels</button></div></section>
      <div class="planner-preserve">Les commandes et réservations déjà reçues restent à honorer, même si vous fermez une heure.</div>
      <div class="planner-footer"><strong id="schedule-summary">Aucun changement</strong><div class="planner-footer-actions"><button type="button" class="secondary-button" id="schedule-discard">Annuler</button><button type="button" class="primary-button" id="schedule-save">Enregistrer</button></div></div>
      <section class="planner-review workspace-panel" id="schedule-review-panel" hidden aria-label="Confirmer les demandes déjà reçues" tabindex="-1"><h3>Attention : des clients sont déjà prévus</h3><p id="schedule-impact"></p><label><input type="checkbox" id="schedule-ack"> Je garde ces commandes ou réservations et je m’en occupe.</label><div class="planner-footer-actions"><button type="button" class="secondary-button" id="schedule-back">Revenir</button><button type="button" class="primary-button" id="schedule-confirm">Confirmer la fermeture</button></div></section>
      <details class="planner-advanced"><summary>Fermer toute la journée ou revenir aux horaires habituels</summary><p>Ces deux actions concernent le retrait, la livraison et les tables pour le jour choisi.</p><button type="button" class="secondary-button" id="schedule-close-day">Fermer toute la journée</button><button type="button" class="secondary-button" id="schedule-reset">Revenir aux horaires habituels</button></details></div>`;

    const q = selector => root.querySelector(selector);
    const message = text => { q('#schedule-message').textContent = text; };
    q('#schedule-date').value = date;
    function dateBounds() {
      q('#schedule-date').min = today();
      const last = new Date(today() + 'T12:00:00Z'); last.setUTCDate(last.getUTCDate() + 13);
      q('#schedule-date').max = last.toISOString().slice(0, 10);
    }
    function summary() {
      const count = changes(data, draft).length;
      q('#schedule-summary').textContent = count ? `${count} créneau${count > 1 ? 'x' : ''} modifié${count > 1 ? 's' : ''} · pas encore enregistré${count > 1 ? 's' : ''}` : 'Aucun changement à enregistrer';
      q('#schedule-save').textContent = count ? `Enregistrer ${count} changement${count > 1 ? 's' : ''}` : 'Enregistrer';
      q('#schedule-save').disabled = busy || !count;
      q('#schedule-discard').disabled = busy || !count;
      q('#schedule-confirm').disabled = busy || !reviewing || !q('#schedule-ack').checked;
    }
    function render() {
      q('#schedule-date').value = date;
      q('#schedule-today').setAttribute('aria-pressed', String(date === today()));
      q('#schedule-tomorrow').setAttribute('aria-pressed', String(date === tomorrow()));
      root.querySelectorAll('[data-period]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.period === period)));
      root.querySelectorAll('[data-schedule-method]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scheduleMethod === method)));
      if (!data) return;
      const rows = data.services[method].filter(row => inPeriod(row.slot, period));
      q('#planner-title').textContent = `${names[method]} · ${periods[period][0]} · ${date.split('-').reverse().join('/')}`;
      q('#schedule-slots').innerHTML = rows.map(row => {
        const open = draft[method][row.slot], pending = open !== row.open;
        return `<button type="button" class="planner-slot ${open ? 'is-open' : 'is-closed'}" data-slot="${escape(row.slot)}" aria-pressed="${open}" aria-label="${escape(row.slot)} : ${open ? 'ouvert' : 'fermé'}. Toucher pour ${open ? 'fermer' : 'ouvrir'}." ${busy ? 'disabled' : ''}><strong>${escape(row.slot)}</strong><span>${open ? '✓ Ouvert' : '✕ Fermé'}</span>${row.committed ? `<small>${row.committed} déjà prévu${row.committed > 1 ? 's' : ''}</small>` : ''}${pending ? '<i aria-hidden="true">À enregistrer</i>' : ''}</button>`;
      }).join('') || '<p>Aucune heure à afficher.</p>';
      q('#schedule-slots').querySelectorAll('[data-slot]').forEach(button => button.onclick = () => {
        if (busy) return;
        const slot = button.dataset.slot;
        draft[method][slot] = !draft[method][slot];
        reviewing = false; q('#schedule-ack').checked = false;
        render(); message('Choisissez d’autres heures si besoin, puis touchez « Enregistrer ».');
      });
      q('#schedule-review-panel').hidden = !reviewing;
      summary();
    }
    function freeze(value) {
      busy = value;
      root.querySelectorAll('button,input').forEach(element => { element.disabled = value; });
      if (data) render();
    }
    async function request(path, body) {
      const auth = token();
      const response = await fetch(api + path, { method: body ? 'PATCH' : 'GET', headers: { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(15000), ...(body ? { body: JSON.stringify(body) } : {}) });
      if (auth !== token()) throw Error('Session modifiée. Reconnectez-vous.');
      if (response.status === 401) { onUnauthorized('Session expirée. Reconnectez-vous.'); throw Error('Session expirée.'); }
      const result = await response.json();
      if (auth !== token()) throw Error('Session modifiée.');
      if (!response.ok) throw Error(result.error || 'Les créneaux n’ont pas pu être chargés.');
      return result;
    }
    function accept(result) { data = result; draft = makeDraft(data); reviewing = false; q('#schedule-ack').checked = false; q('#schedule-editor').hidden = false; render(); }
    async function load() {
      if (busy || !token()) return;
      if (changes(data, draft).length) { message('Enregistrez ou annulez vos changements avant de changer de jour.'); render(); return; }
      const id = ++epoch; dateBounds(); data = draft = null; q('#schedule-editor').hidden = true; freeze(true); message('Chargement des créneaux…');
      try { const result = await request('/dashboard/service-schedule?date=' + encodeURIComponent(date)); if (id !== epoch) return; accept(result); message('Touchez les heures à ouvrir ou fermer.'); }
      catch (error) { if (id === epoch) message(error.message); }
      finally { if (id === epoch) freeze(false); }
    }
    function chooseDate(next) {
      if (changes(data, draft).length) { render(); message('Enregistrez ou annulez vos changements avant de changer de jour.'); return; }
      if (next < q('#schedule-date').min || next > q('#schedule-date').max) { render(); message('Choisissez un jour dans les 14 prochains jours.'); return; }
      date = next; void load();
    }
    q('#schedule-date').onchange = () => chooseDate(q('#schedule-date').value);
    q('#schedule-today').onclick = () => chooseDate(today());
    q('#schedule-tomorrow').onclick = () => chooseDate(tomorrow());
    root.querySelectorAll('[data-period]').forEach(button => button.onclick = () => { period = button.dataset.period; render(); });
    root.querySelectorAll('[data-schedule-method]').forEach(button => button.onclick = () => { method = button.dataset.scheduleMethod; render(); });
    q('#schedule-close-period').onclick = () => { if (!data || busy) return; for (const row of data.services[method].filter(row => inPeriod(row.slot, period))) draft[method][row.slot] = false; reviewing = false; render(); message('Ce moment sera fermé après enregistrement.'); };
    q('#schedule-open-period').onclick = () => { if (!data || busy) return; for (const row of data.services[method].filter(row => inPeriod(row.slot, period) && row.standard)) draft[method][row.slot] = true; reviewing = false; render(); message('Les horaires habituels seront ouverts après enregistrement.'); };
    q('#schedule-close-day').onclick = () => { if (!data || busy) return; for (const key of Object.keys(names)) for (const row of data.services[key]) draft[key][row.slot] = false; reviewing = false; render(); message('Les trois services seront fermés pour ce jour après enregistrement.'); };
    q('#schedule-reset').onclick = () => { if (!data || busy) return; for (const key of Object.keys(names)) for (const row of data.services[key]) draft[key][row.slot] = row.standard; reviewing = false; render(); message('Les horaires habituels seront rétablis après enregistrement.'); };
    q('#schedule-discard').onclick = () => { if (!data || busy) return; draft = makeDraft(data); reviewing = false; q('#schedule-ack').checked = false; render(); message('Changements annulés.'); };
    q('#schedule-back').onclick = () => { reviewing = false; q('#schedule-ack').checked = false; render(); };
    q('#schedule-ack').onchange = summary;
    q('#schedule-save').onclick = async () => {
      if (busy || !changes(data, draft).length) return;
      const affected = impacts(data, draft);
      if (affected.length) {
        reviewing = true;
        q('#schedule-impact').textContent = `${affected.length} créneau${affected.length > 1 ? 'x' : ''} à fermer ${affected.length > 1 ? 'ont' : 'a'} déjà des commandes ou des tables. La fermeture n’annule pas ces demandes.`;
        render(); q('#schedule-review-panel').focus(); q('#schedule-review-panel').scrollIntoView({ block: 'nearest' });
        return;
      }
      await save();
    };
    q('#schedule-confirm').onclick = async () => { if (!reviewing || !q('#schedule-ack').checked) return; await save(); };
    async function save() {
      if (busy || !data || !changes(data, draft).length || (impacts(data, draft).length && !q('#schedule-ack').checked)) return;
      const id = epoch, body = { date, revision: data.revision, services: draft, acknowledgeExisting: q('#schedule-ack').checked };
      freeze(true); message('Enregistrement…');
      try { const result = await request('/dashboard/service-schedule', body); if (id !== epoch) return; accept(result); message('C’est enregistré. Les heures affichées sont maintenant à jour.'); }
      catch (error) { if (id === epoch) message(error.name === 'TimeoutError' ? 'La réponse est trop lente. Vérifiez les créneaux avant de réessayer.' : error.message); }
      finally { if (id === epoch) freeze(false); }
    }
    global.addEventListener('beforeunload', event => { if (changes(data, draft).length) { event.preventDefault(); event.returnValue = ''; } });
    dateBounds(); render();
    return { load, clear() { epoch++; data = draft = null; busy = reviewing = false; q('#schedule-editor').hidden = true; message(''); freeze(false); } };
  };
})(typeof window === 'undefined' ? null : window);
