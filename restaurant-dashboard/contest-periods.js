/* Shared app/web participants, read-only. All draws happen outside this panel. */
window.BibouContestPeriods = function ({ root, api, token, onUnauthorized }) {
  let data = null, busy = false, epoch = 0;
  const q = selector => root.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const date = value => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  const status = { draft: 'Brouillon', scheduled: 'À venir', active: 'En cours · liste provisoire', complete: 'Quinzaine terminée' };
  root.innerHTML = `<section class="marketing-panel"><h2>Tirages extérieurs · participants par quinzaine</h2><p>Une liste commune iPhone, Android et web. Une seule chance par compte actif, avec ou sans achat. Inscription, appui sur Partager, parrainage validé ou commande payée dans la quinzaine ; la roue reste séparée. Le menu bonus est valable 30 jours après le tirage. Aucun gagnant, cadeau ou message n’est créé en ouvrant cette page.</p><label>Quinzaine<select id="period-select"></select></label><p id="period-feedback" role="status" aria-live="polite"></p><div id="period-summary"></div><div id="period-participants"></div><div class="marketing-actions"><button type="button" class="secondary-button" id="period-reload">Actualiser la liste</button><button type="button" class="secondary-button" id="period-export" disabled>Télécharger la liste du tirage</button></div><p>Le fichier contient les pseudonymes et identifiants des comptes, pas les téléphones. Le nom affiché ici sert uniquement à retrouver le client. Réalisez le tirage à l’extérieur et conservez la liste utilisée ; annoncez le pseudonyme du gagnant dans une actualité, sans publier ses coordonnées.</p></section>`;
  const message = value => { q('#period-feedback').textContent = value; };
  const freeze = () => { q('#period-select').disabled = busy || !data?.periods?.length; q('#period-reload').disabled = busy; q('#period-export').disabled = busy || !data?.exportReady || !data.total; };
  async function request(period) {
    const current = token(), controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(api + '/dashboard/contest/periods' + (period ? '?period=' + encodeURIComponent(period) : ''), { method: 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${current}` }, signal: controller.signal });
      if (current !== token()) throw Error('Session modifiée.');
      if (response.status === 401) { onUnauthorized(); throw Error('Reconnectez-vous.'); }
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Liste indisponible.');
      return result;
    } finally { clearTimeout(timeout); }
  }
  function render() {
    q('#period-select').innerHTML = data.periods.map(p => `<option value="${p.number}" ${p.number === data.period?.number ? 'selected' : ''}>Quinzaine ${p.number} · ${escape(p.startDate)} → ${escape(p.endDate)} · ${status[p.status]}</option>`).join('');
    if (data.period) q('#period-select').value = String(data.period.number);
    q('#period-summary').innerHTML = data.period ? `<p><strong>${data.total} participant(s) · ${status[data.period.status]}</strong></p><p>Du ${date(data.period.startsAt)} au ${date(new Date(Date.parse(data.period.endsAt) - 1).toISOString())}, heure de Paris. Un achat plus important ou plusieurs actions ne donnent pas de chance supplémentaire.</p>${data.excludedTail ? `<p>Pas de tirage bonus du ${escape(data.excludedTail.startDate)} au ${escape(data.excludedTail.endDate)}. Le classement général continue jusqu’à sa clôture.</p>` : ''}` : '<p>Choisissez les dates du concours dans le brouillon pour préparer les quinzaines. Aucun lancement effectué.</p>';
    q('#period-participants').innerHTML = data.participants.length ? `<ol>${data.participants.map(row => `<li><strong>${escape(row.alias)}</strong>${row.customerName ? ` · ${escape(row.customerName)}` : ''} — ${row.actions.map(action => escape(data.actionLabels[action] || action)).join(', ')} · 1 chance</li>`).join('')}</ol>` : '<p>Aucune participation éligible enregistrée pour cette quinzaine.</p>';
    freeze();
  }
  async function load(period) {
    if (busy || !token()) return;
    const id = ++epoch; busy = true; freeze(); message('Lecture de la liste…');
    try { const result = await request(period); if (id !== epoch) return; data = result; render(); message('Liste lue uniquement. Aucun tirage ni changement de points.'); }
    catch (error) { if (id === epoch) { data = null; q('#period-summary').innerHTML = ''; q('#period-participants').innerHTML = ''; message(error.name === 'AbortError' ? 'Connexion trop lente. Réessayez.' : error.message); } }
    finally { if (id === epoch) { busy = false; freeze(); } }
  }
  const cell = value => { let text = String(value ?? ''); if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
  async function download() {
    if (busy || !token() || !data?.exportReady || !data.total) return;
    const original = data, id = ++epoch; busy = true; freeze(); message('Vérification de la liste avant téléchargement…');
    try {
      const fresh = await request(original.period.number); if (id !== epoch) return;
      data = fresh; render();
      if (!fresh.exportReady || fresh.fingerprint !== original.fingerprint) return message('La liste a changé. Relisez la version actualisée avant de la télécharger.');
      const rows = [['Pseudonyme', 'Identifiant du compte', 'Activités enregistrées', 'Première activité', 'Dernière activité', 'Chances', 'Empreinte de la liste', 'Vérifiée le']];
      for (const row of fresh.participants) rows.push([row.alias, row.customerId, row.actions.map(action => fresh.actionLabels[action]).join(' / '), row.firstActivityAt, row.lastActivityAt, 1, fresh.fingerprint, fresh.generatedAt]);
      const blob = new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = objectUrl; link.download = `bibou-tirage-quinzaine-${fresh.period.number}-${fresh.period.startDate}-${fresh.period.endDate}.csv`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      message('Liste téléchargée. Le tirage et l’annonce du gagnant restent à réaliser à l’extérieur.');
    } catch (error) { if (id === epoch) message(error.name === 'AbortError' ? 'Connexion trop lente : aucun fichier créé.' : error.message); }
    finally { if (id === epoch) { busy = false; freeze(); } }
  }
  q('#period-select').onchange = () => void load(q('#period-select').value);
  q('#period-reload').onclick = () => void load(data?.period?.number);
  q('#period-export').onclick = () => void download();
  return { load, clear() { epoch++; data = null; busy = false; q('#period-select').innerHTML = ''; q('#period-summary').innerHTML = ''; q('#period-participants').innerHTML = ''; message(''); freeze(); } };
};
