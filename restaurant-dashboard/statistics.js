/* Owner-only real aggregates. No sample data, customer lists or cached API data. */
window.BibouStatistics = function ({ root, api, token, onUnauthorized }) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = value => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value || 0) / 100);
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date(value + 'T12:00:00Z')) : escape(value);
  let epoch = 0, controller = null, data = null;
  root.innerHTML = `<section class="statistics-intro"><p class="eyebrow">VOTRE ACTIVITÉ RÉELLE</p><h2>Vos chiffres, simplement.</h2><p>Commandes et abonnements réellement payés, remboursements enregistrés et clients qui reviennent. Aucun chiffre fictif.</p><div class="statistics-filters"><label>Affichage<select id="statistics-granularity"><option value="hour">Par heure · une journée</option><option value="day">Par jour · une semaine</option><option value="week">Par semaine · un mois</option><option value="month">Par mois · une année</option></select></label><label>Date de référence<input type="date" id="statistics-date" value="${today()}" /></label><button type="button" id="statistics-refresh" class="secondary-button">Actualiser les chiffres</button><button type="button" id="statistics-present" class="primary-button" disabled>Vue présentation</button></div></section><p id="statistics-feedback" role="status" aria-live="polite"></p><div id="statistics-content"></div><dialog id="statistics-dialog" class="statistics-dialog" aria-label="Présentation des chiffres réels"><button type="button" id="statistics-close" class="secondary-button">Fermer la présentation</button><div id="statistics-presentation"></div></dialog>`;
  const q = selector => root.querySelector(selector);
  const card = (label, value, detail = '') => `<article class="statistics-card"><span>${escape(label)}</span><strong>${escape(value)}</strong>${detail ? `<small>${escape(detail)}</small>` : ''}</article>`;
  function markup() {
    const total = data.totals, clients = data.customers;
    const largest = Math.max(1, ...data.series.map(bucket => Math.abs(bucket.netCents)));
    const labels = { hour: 'Par heure', day: 'Par jour', week: 'Par semaine', month: 'Par mois' };
    return `<section class="statistics-report"><div class="statistics-heading"><div><p class="eyebrow">BIBOU’S BURGERS · CHIFFRES RÉELS</p><h2>${labels[data.granularity]}</h2><p>Du ${dateLabel(data.range.start)} au ${dateLabel(data.range.end)} · heure de Paris</p></div><span class="statistics-badge">Données enregistrées</span></div><div class="statistics-cards">${card('Encaissements nets enregistrés', money(total.netCents), 'TTC · après remboursements enregistrés')}${card('Commandes payées', total.orderCount, `${total.subscriptionCount} abonnement(s) Bibou + en plus`)}${card('Clients identifiés de retour', `${clients.returning} / ${clients.identified}`, clients.returningPercent === null ? 'Pas de client identifié sur cette période' : `${clients.returningPercent} % avaient déjà acheté avant la période`)}${card('Clients récurrents', clients.recurring, 'Au moins deux commandes payées non annulées')}</div><div class="statistics-breakdown"><span>Avant remboursements : <strong>${money(total.grossCents)}</strong></span><span>Remboursements enregistrés : <strong>${money(total.refundCents)}</strong></span><span>Clients au premier achat : <strong>${clients.firstPurchaseInPeriod}</strong></span><span>Commandes sans client identifié : <strong>${clients.unlinkedOrders}</strong></span></div>${data.pendingRefundsCents ? `<p class="statistics-warning">${money(data.pendingRefundsCents)} de remboursements restent à traiter dans l’historique. Ils ne sont pas déduits tant qu’ils ne sont pas enregistrés comme effectués.</p>` : ''}<section class="statistics-chart" aria-label="Évolution des encaissements nets">${data.series.map(bucket => `<div class="statistics-bar-row"><span>${escape(bucket.label)}</span><div class="statistics-track"><div class="statistics-bar ${bucket.netCents < 0 ? 'negative' : ''}" style="width:${Math.min(100, Math.abs(bucket.netCents) / largest * 100)}%"></div></div><strong>${money(bucket.netCents)}</strong></div>`).join('')}</section><details class="statistics-detail"><summary>Voir les montants détaillés</summary><div class="statistics-table-wrap"><table><thead><tr><th>Période</th><th>Encaissements</th><th>Remboursements</th><th>Net</th><th>Commandes</th></tr></thead><tbody>${data.series.map(bucket => `<tr><th>${escape(bucket.label)}</th><td>${money(bucket.grossCents)}</td><td>${money(bucket.refundCents)}</td><td>${money(bucket.netCents)}</td><td>${bucket.orderCount}</td></tr>`).join('')}</tbody></table></div></details><div class="statistics-scope"><strong>Ce sont les encaissements enregistrés ici, pas le bénéfice total du restaurant.</strong>${data.notes.map(note => `<p>${escape(note)}</p>`).join('')}<p>Premier paiement conservé : ${data.firstRecordedPaymentDate ? dateLabel(data.firstRecordedPaymentDate) : 'aucun paiement dans l’historique'}.</p>${Object.entries(data.warnings).some(([, value]) => value > 0) ? `<p class="statistics-warning">Qualité de l’historique : ${data.warnings.legacyPaymentDates} paiement(s) daté(s) d’après l’ancienne date de commande ; ${data.warnings.missingPaymentDates} date(s) de paiement et ${data.warnings.missingRefundDates} date(s) de remboursement manquantes ; ${data.warnings.invalidAmounts} montant(s) invalides ; ${data.warnings.duplicateRecords} doublon(s) exclus. Aucun chiffre manquant n’est inventé.</p>` : ''}</div></section>`;
  }
  function clear() {
    epoch++; controller?.abort(); controller = null; data = null;
    q('#statistics-content').innerHTML = ''; q('#statistics-presentation').innerHTML = '';
    q('#statistics-feedback').textContent = ''; q('#statistics-present').disabled = true;
    if (q('#statistics-dialog').open) q('#statistics-dialog').close();
  }
  async function load() {
    const session = token(); if (!session) return clear();
    controller?.abort(); controller = new AbortController(); const requestController = controller, id = ++epoch;
    const timeout = setTimeout(() => requestController.abort(), 15000);
    data = null; q('#statistics-content').innerHTML = ''; q('#statistics-presentation').innerHTML = ''; q('#statistics-present').disabled = true;
    if (q('#statistics-dialog').open) q('#statistics-dialog').close();
    q('#statistics-feedback').textContent = 'Chargement des chiffres réels…';
    try {
      const query = new URLSearchParams({ granularity: q('#statistics-granularity').value, date: q('#statistics-date').value });
      const response = await fetch(`${api}/dashboard/statistics?${query}`, { headers: { Authorization: `Bearer ${session}` }, cache: 'no-store', signal: requestController.signal });
      if (id !== epoch || session !== token()) return;
      if (response.status === 401) { clear(); onUnauthorized(); return; }
      const result = await response.json(); if (id !== epoch || session !== token()) return;
      if (!response.ok) throw Error(result.error || 'Statistiques indisponibles.');
      if (result.fictitious !== false || result.source !== 'recorded-production-transactions') throw Error('La source des chiffres réels n’a pas pu être vérifiée.');
      data = result; q('#statistics-content').innerHTML = markup(); q('#statistics-present').disabled = false;
      q('#statistics-feedback').textContent = 'Chiffres réels chargés. Aucun paiement ni information client modifié.';
    } catch (error) {
      if (id === epoch) { q('#statistics-feedback').textContent = error.name === 'AbortError' ? 'Chargement trop lent. Les chiffres affichés précédemment peuvent être anciens : actualisez.' : error.message; q('#statistics-present').disabled = true; }
    } finally { clearTimeout(timeout); }
  }
  q('#statistics-refresh').addEventListener('click', load);
  q('#statistics-granularity').addEventListener('change', load);
  q('#statistics-date').addEventListener('change', load);
  q('#statistics-present').addEventListener('click', () => { if (!data || !token()) return; q('#statistics-presentation').innerHTML = markup(); q('#statistics-dialog').showModal(); });
  q('#statistics-close').addEventListener('click', () => q('#statistics-dialog').close());
  return { load, clear };
};
