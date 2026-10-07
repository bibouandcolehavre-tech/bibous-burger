window.BibouDispatch = (() => {
  const activeStatuses = ['offered', 'accepted', 'picked_up', 'issue'];
  const labels = { offered: 'Attend la réponse du livreur', accepted: 'Acceptée · repas à récupérer', picked_up: 'En livraison', delivered: 'Livrée', issue: 'Incident · contactez le livreur', declined: 'Refusée · choisissez un autre livreur', expired: 'Sans réponse · choisissez un autre livreur' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : String(value || '');

  function markup(order) {
    if (order?.method !== 'delivery' || !['ready', 'out_for_delivery'].includes(order.status)) return '';
    const assignment = order.kroklyDriver;
    if (assignment && activeStatuses.includes(assignment.status)) return `<div class="amendment-notice"><strong>Livraison Krokly</strong><p>${esc(labels[assignment.status])}</p><button type="button" data-open-dispatch>Voir la répartition des courses</button></div>`;
    const uber = order.uberDirect;
    if (uber && ['sending', 'uncertain', 'created'].includes(uber.phase) && !['canceled', 'returned', 'delivered'].includes(uber.status)) return '';
    return order.status === 'ready' ? '<div class="amendment-notice"><strong>Votre livreur</strong><p>Choisissez le livreur à qui proposer cette commande.</p><button type="button" data-open-dispatch>Répartir les courses</button></div>' : '';
  }

  function create({ root, api, token, onUnauthorized, onOrdersChanged = () => {}, getOrder = () => null }) {
    let data = null, fresh = false, busy = false, loading = false, generation = 0, lastRender = '';
    const selections = new Map();
    root.innerHTML = `<div class="menu-intro"><p class="eyebrow">VOS LIVREURS · KROKLY</p><h2>Répartir les courses</h2><p>Une commande payée et marquée prête, un livreur choisi, puis le suivi de sa livraison. Vous restez dans votre back-office.</p></div>
      <p data-dispatch-feedback class="menu-feedback" role="status" aria-live="polite"></p>
      <div data-dispatch-metrics class="dispatch-metrics"></div>
      <div class="dispatch-columns"><section class="workspace-panel"><h2>Commandes à attribuer</h2><div data-dispatch-ready></div></section><section class="workspace-panel"><h2>Livraisons attribuées</h2><div data-dispatch-assigned></div></section></div>
      <section class="workspace-panel dispatch-team"><h2>Mes livreurs</h2><div data-dispatch-drivers></div><p class="menu-note">Chaque livreur se connecte à Krokly Driver avec son compte personnel. L’alerte sur l’iPhone verrouillé doit être testée sur son téléphone ; pendant le pilote, surveillez aussi les courses ici.</p></section>`;
    const q = selector => root.querySelector(selector);
    const feedback = value => { q('[data-dispatch-feedback]').textContent = value; };
    async function request(route = '', method = 'GET', body) {
      const session = token();
      if (!session) throw Error('Reconnectez-vous au back-office.');
      const response = await fetch(`${api}/dashboard/krokly-drivers${route}`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000), ...(body ? { body: JSON.stringify(body) } : {}) });
      if (session !== token()) throw Error('La connexion a changé.');
      if (response.status === 401) { onUnauthorized(); throw Error('Reconnectez-vous au back-office.'); }
      const result = await response.json().catch(() => null);
      if (session !== token()) throw Error('La connexion a changé.');
      if (!response.ok) throw Error(result?.error || 'La répartition est momentanément indisponible.');
      if (!result) throw Error('La réponse du serveur est indisponible.');
      return result;
    }
    function card(order, assigned) {
      const details = getOrder(order.id);
      const driver = data.drivers.find(item => item.id === order.assignment?.driverId);
      const drivers = data.drivers.filter(item => item.active);
      const selected = selections.get(order.id);
      const choices = drivers.map(item => `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''}>${esc(item.name)}</option>`).join('');
      return `<article class="dispatch-order"><h3>Commande #${Number(order.number)}${details?.customer ? ` · ${esc(details.customer)}` : ''}</h3><p>${esc(dateLabel(order.serviceDate))} · ${esc(order.slot)}</p>
        ${assigned ? `<p class="dispatch-status"><strong>${esc(driver?.name || 'Livreur attribué')}</strong><br>${esc(labels[order.assignment.status] || order.assignment.status)}</p>${order.assignment.status === 'offered' ? '<small>Sans réponse après cinq minutes, la commande redevient attribuable.</small>' : ''}` : `${order.assignment && ['declined', 'expired'].includes(order.assignment.status) ? `<p>${esc(labels[order.assignment.status])}</p>` : ''}${drivers.length ? `<div class="dispatch-assign"><label>Livreur<select data-dispatch-select="${esc(order.id)}" aria-label="Livreur pour la commande ${Number(order.number)}" ${!fresh || busy ? 'disabled' : ''}><option value="">Choisir un livreur</option>${choices}</select></label><button type="button" class="primary-button" data-dispatch-assign="${esc(order.id)}" ${!fresh || busy ? 'disabled' : ''}>Proposer la course</button></div>` : '<p>Aucun compte livreur actif. Aucun envoi possible pour le moment.</p>'}`}</article>`;
    }
    function render() {
      if (!data) return;
      const ready = data.orders.filter(order => order.eligible);
      const assigned = data.orders.filter(order => activeStatuses.includes(order.assignment?.status));
      q('[data-dispatch-metrics]').innerHTML = `<article><strong>${ready.length}</strong><span>à attribuer</span></article><article><strong>${assigned.length}</strong><span>attribuée(s)</span></article><article><strong>${data.drivers.filter(driver => driver.active).length}</strong><span>livreur(s) actif(s)</span></article>`;
      q('[data-dispatch-ready]').innerHTML = ready.map(order => card(order, false)).join('') || '<p class="dispatch-empty">Aucune commande prête à attribuer. Acceptez puis marquez prête une commande de livraison payée du jour. Les commandes déjà confiées à Uber ne sont pas proposées ici.</p>';
      q('[data-dispatch-assigned]').innerHTML = assigned.map(order => card(order, true)).join('') || '<p class="dispatch-empty">Aucune livraison attribuée pour le moment.</p>';
      q('[data-dispatch-drivers]').innerHTML = data.drivers.map(driver => `<article class="dispatch-driver"><strong>${esc(driver.name)}</strong><span>${driver.active ? 'Compte actif' : 'Compte désactivé'} · ${Number(driver.pushDevices) || 0} téléphone(s) inscrit(s) aux alertes</span></article>`).join('') || '<p class="dispatch-empty">Aucun livreur créé pour le moment.</p>';
    }
    async function load() {
      if (busy || loading || !token()) return;
      const current = generation;
      loading = true;
      try {
        const result = await request();
        if (current !== generation) return;
        if (!Array.isArray(result.orders) || !Array.isArray(result.drivers)) throw Error('Réponse de répartition invalide.');
        data = result;
        const digest = JSON.stringify(result);
        const changed = digest !== lastRender || !fresh;
        fresh = true;
        lastRender = digest;
        if (changed) render();
        feedback('À jour · vérification automatique toutes les 10 secondes.');
      } catch (error) {
        if (current !== generation) return;
        fresh = false;
        render();
        feedback(`${error.name === 'TimeoutError' ? 'Le serveur ne répond pas.' : error.message} Attribution bloquée jusqu’à une actualisation réussie.`);
      } finally { if (current === generation) loading = false; }
    }
    async function assign(orderId) {
      if (busy || loading || !fresh || !token()) return;
      const driverId = q(`[data-dispatch-select="${CSS.escape(orderId)}"]`)?.value;
      const order = data.orders.find(item => item.id === orderId && item.eligible);
      const driver = data.drivers.find(item => item.id === driverId && item.active);
      if (!order || !driver) return feedback('Choisissez un livreur actif avant de proposer la course.');
      const current = generation;
      busy = true;
      render();
      feedback('Envoi de la proposition au livreur…');
      try {
        await request(`/orders/${encodeURIComponent(orderId)}/assign`, 'POST', { driverId });
        if (current !== generation) return;
        selections.delete(orderId);
        busy = false;
        await load();
        if (current !== generation) return;
        if (fresh) feedback(`Course #${Number(order.number)} proposée à ${driver.name}. Attendez son acceptation.`);
        void onOrdersChanged();
      } catch (error) {
        if (current !== generation) return;
        // A lost response may hide a successful assignment: never allow a blind retry.
        fresh = false;
        busy = false;
        render();
        feedback(`${error.message} Actualisez pour vérifier la course avant tout nouvel envoi.`);
        void onOrdersChanged();
      } finally { if (current === generation) busy = false; }
    }
    root.addEventListener('change', event => { if (event.target.dataset.dispatchSelect) selections.set(event.target.dataset.dispatchSelect, event.target.value); });
    root.addEventListener('click', event => { const button = event.target.closest('[data-dispatch-assign]'); if (button && !button.disabled) void assign(button.dataset.dispatchAssign); });
    function clear() {
      generation++;
      data = null; fresh = busy = loading = false; lastRender = '';
      selections.clear();
      for (const selector of ['[data-dispatch-metrics]', '[data-dispatch-ready]', '[data-dispatch-assigned]', '[data-dispatch-drivers]']) q(selector).innerHTML = '';
      feedback('');
    }
    return { load, clear };
  }
  return { create, markup, activeStatuses };
})();
