window.BibouDispatch = (() => {
  const activeStatuses = ['offered', 'accepted', 'picked_up', 'issue'];
  const labels = { offered: 'Attend la réponse du livreur', accepted: 'Acceptée · repas à récupérer', picked_up: 'En livraison', delivered: 'Livrée', issue: 'Incident · contactez le livreur', declined: 'Refusée · choisissez un autre livreur', expired: 'Sans réponse · choisissez un autre livreur' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : String(value || '');
  const timeLabel = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}) : 'à vérifier';
  const timing = order => order.preparation ? `<p><strong>${order.preparation.manuallyReadyAt ? 'Repas confirmé prêt à' : 'Repas estimé vers'} ${esc(timeLabel(order.preparation.estimatedReadyAt))}</strong><br>Proposition prévue à ${esc(timeLabel(order.preparation.notifyAt))}${order.preparation.manuallyReadyAt ? ' · appel avancé par le restaurant' : ` · ${Number(order.preparation.preparationMinutes)} min de préparation estimée`}${order.preparation.state === 'waiting_for_driver' ? '<br>Aucun livreur disponible : en attente, sans envoi supplémentaire.' : ''}</p>` : '';

  function markup(order) {
    if (order?.method !== 'delivery' || !['preparing','ready', 'out_for_delivery'].includes(order.status)) return '';
    const assignment = order.kroklyDriver;
    if (assignment && activeStatuses.includes(assignment.status)) return `<div class="amendment-notice"><strong>Livraison Krokly</strong><p>${esc(labels[assignment.status])}</p><button type="button" data-open-dispatch>Voir la répartition des courses</button></div>`;
    const uber = order.uberDirect;
    if (uber && ['sending', 'uncertain', 'created'].includes(uber.phase) && !['canceled', 'returned', 'delivered'].includes(uber.status)) return '';
    if (order.status === 'preparing') return '<div class="amendment-notice"><strong>Votre livreur</strong><p>Consultez la proposition programmée ou l’attribution manuelle.</p><button type="button" data-open-dispatch>Voir la répartition des courses</button></div>';
    return order.status === 'ready' ? '<div class="amendment-notice"><strong>Votre livreur</strong><p>Choisissez le livreur à qui proposer cette commande.</p><button type="button" data-open-dispatch>Répartir les courses</button></div>' : '';
  }

  function create({ root, api, token, onUnauthorized, onOrdersChanged = () => {}, getOrder = () => null }) {
    let data = null, fresh = false, busy = false, loading = false, generation = 0, lastRender = '';
    const selections = new Map();
    root.innerHTML = `<div class="menu-intro"><p class="eyebrow">VOS LIVREURS · KROKLI</p><h2>Répartir les courses</h2><p>Planifiez la proposition dès l’acceptation, ou choisissez vous-même le livreur. Le minuteur ne marque jamais le repas prêt.</p></div>
      <p data-dispatch-feedback class="menu-feedback" role="status" aria-live="polite"></p><div data-photo-delivery></div>
      <section class="workspace-panel" data-dispatch-settings></section>
      <div data-dispatch-metrics class="dispatch-metrics"></div>
      <section class="workspace-panel"><h2>En préparation · appel du livreur</h2><div data-dispatch-scheduled></div></section>
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
      if (!response.ok) throw Object.assign(Error(result?.error || 'La répartition est momentanément indisponible.'),{status:response.status});
      if (!result) throw Error('La réponse du serveur est indisponible.');
      return result;
    }
    const externalImport = window.KrokliExternalDelivery?.create({root:q('[data-photo-delivery]'),request,onCreated:async delivery=>{await load();feedback(`Course Uber #${delivery.number} créée · ${Number(delivery.distanceKm).toLocaleString('fr-FR')} km · ${(delivery.driverPayCents/100).toFixed(2).replace('.',',')} € pour le livreur. Confirmez le repas prêt, puis choisissez le livreur.`);}});
    function contact(order, details) {
      const phone = details?.phone || order.phone || order.customerPhone;
      return phone && window.KrokliPhoneContact ? `<div>${window.KrokliPhoneContact.markup(phone)}</div>` : '';
    }
    function card(order, assigned) {
      const details = getOrder(order.id);
      const driver = data.drivers.find(item => item.id === order.assignment?.driverId);
      const drivers = data.drivers.filter(item => item.active);
      const selected = selections.get(order.id);
      const choices = drivers.map(item => `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''}>${esc(item.name)}</option>`).join('');
      return `<article class="dispatch-order">${order.source==='uber_eats'?'<span class="external-source">UBER · COURSE IMPORTÉE</span>':''}<h3>${order.source==='uber_eats'?'Course Uber':'Commande'} #${Number(order.number)}${details?.customer ? ` · ${esc(details.customer)}` : order.customerName?` · ${esc(order.customerName)}`:''}</h3><p>${esc(dateLabel(order.serviceDate))} · ${esc(order.slot)}</p>${order.source==='uber_eats'?`<p class="external-detail">${esc(order.reference?`Référence Uber : ${order.reference}`:'Référence non renseignée')}<br>${esc([order.deliveryAddress?.address,order.deliveryAddress?.postalCode,order.deliveryAddress?.city].filter(Boolean).join(', '))}<br>Paiement géré dans Uber · ne rien encaisser.</p>`:''}${timing(order)}
        ${contact(order, details)}${assigned ? `<p class="dispatch-status"><strong>${esc(driver?.name || 'Livreur attribué')}</strong><br>${esc(labels[order.assignment.status] || order.assignment.status)}</p>${order.assignment.status === 'offered' ? '<small>Sans réponse après cinq minutes, la commande redevient attribuable.</small>' : ''}` : `${order.assignment && ['declined', 'expired'].includes(order.assignment.status) ? `<p>${esc(labels[order.assignment.status])}</p>` : ''}${drivers.length ? `<div class="dispatch-assign"><label>Livreur<select data-dispatch-select="${esc(order.id)}" aria-label="Livreur pour la commande ${Number(order.number)}" ${!fresh || busy ? 'disabled' : ''}><option value="">Choisir un livreur</option>${choices}</select></label><button type="button" class="primary-button" data-dispatch-assign="${esc(order.id)}" ${!fresh || busy ? 'disabled' : ''}>Proposer la course</button></div>` : '<p>Aucun compte livreur actif. Aucun envoi possible pour le moment.</p>'}`}${order.source==='uber_eats'&&!['accepted','picked_up'].includes(order.assignment?.status)?`<button type="button" data-external-action="cancel" data-external-id="${esc(order.id)}" ${!fresh||busy?'disabled':''}>Annuler cet import</button>`:''}</article>`;
    }
    function render() {
      if (!data) return;
      const ready = data.orders.filter(order => order.eligible);
      const assigned = data.orders.filter(order => activeStatuses.includes(order.assignment?.status));
      const scheduled = data.orders.filter(order=>order.status==='preparing'&&!order.eligible&&!activeStatuses.includes(order.assignment?.status));
      q('[data-dispatch-settings]').innerHTML = data.dispatchSettings ? `<h2>Propositions automatiques ${data.dispatchSettings.enabled ? 'activées' : 'désactivées'}</h2><p>Après une nouvelle acceptation : préparation estimée à 15 min sous 40 €, 30 min de 40 € à 100 € inclus, 35 min au-delà de 100 €, hors frais et réductions. Appel 5 min avant la fin estimée. Si le repas est prêt plus tôt, cliquez sur « Prête » : l’appel est avancé sans attendre le minuteur, sauf si un livreur est déjà proposé ou a accepté. Seuls les livreurs qui se déclarent disponibles sont proposés, un par un, hors tournée groupée. Priorité aux positions GPS partagées récentes les plus proches du restaurant ; sans position récente, rotation des disponibles. La proximité est mesurée à vol d’oiseau, pas en temps de trajet routier.</p><button type="button" data-dispatch-toggle ${!fresh||busy?'disabled':''}>${data.dispatchSettings.enabled ? 'Désactiver les prochains appels automatiques' : 'Activer pour les prochaines commandes'}</button><p>Les anciennes commandes ne sont pas reprises automatiquement, sauf si vous les marquez « Prête ». Les propositions déjà envoyées restent à traiter.</p>` : '<p>Planification automatique non disponible sur cette version du serveur.</p>';
      q('[data-dispatch-scheduled]').innerHTML = scheduled.map(order=>order.source==='uber_eats'?`<article class="dispatch-order"><span class="external-source">UBER · COURSE IMPORTÉE</span><h3>Course Uber #${Number(order.number)} · ${esc(order.customerName)}</h3><p>${esc(order.deliveryAddress?.address)} · ${esc(order.deliveryAddress?.city)}</p><p>Importée, pas encore proposée au livreur. Paiement géré dans Uber.</p><button type="button" class="primary-button external-ready" data-external-action="ready" data-external-id="${esc(order.id)}" ${!fresh||busy?'disabled':''}>Le repas est prêt</button><button type="button" data-external-action="cancel" data-external-id="${esc(order.id)}" ${!fresh||busy?'disabled':''}>Annuler cet import</button></article>`:`<article class="dispatch-order"><h3>Commande #${Number(order.number)}</h3>${timing(order)||'<p>Préparation en cours, sans appel automatique planifié. L’attribution manuelle sera disponible une fois le repas marqué prêt.</p>'}</article>`).join('')||'<p>Aucune commande en attente de son heure d’appel.</p>';
      q('[data-dispatch-metrics]').innerHTML = `<article><strong>${ready.length}</strong><span>à attribuer</span></article><article><strong>${assigned.length}</strong><span>attribuée(s)</span></article><article><strong>${data.drivers.filter(driver => driver.active).length}</strong><span>livreur(s) actif(s)</span></article>`;
      q('[data-dispatch-ready]').innerHTML = ready.map(order => card(order, false)).join('') || '<p class="dispatch-empty">Aucune commande prête à attribuer. Acceptez puis marquez prête une commande de livraison payée du jour. Les commandes déjà confiées à Uber ne sont pas proposées ici.</p>';
      q('[data-dispatch-assigned]').innerHTML = assigned.map(order => card(order, true)).join('') || '<p class="dispatch-empty">Aucune livraison attribuée pour le moment.</p>';
      q('[data-dispatch-drivers]').innerHTML = data.drivers.map(driver => `<article class="dispatch-driver"><strong>${esc(driver.name)}</strong><span>${driver.active ? 'Compte actif' : 'Compte désactivé'} · ${driver.availability?.available ? 'Disponible pour les appels automatiques' : 'Indisponible pour les appels automatiques'} · ${Number(driver.pushDevices) || 0} téléphone(s) inscrit(s) aux alertes</span></article>`).join('') || '<p class="dispatch-empty">Aucun livreur créé pour le moment.</p>';
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
    async function toggleAutomatic() {
      if(busy||loading||!fresh||!data?.dispatchSettings)return;
      const enabled=!data.dispatchSettings.enabled;
      if(!window.confirm(enabled?'Activer les propositions automatiques uniquement pour les prochaines commandes acceptées, selon les délais affichés ? Aucun envoi pour les anciennes commandes.':'Désactiver les prochains appels automatiques ? Les propositions déjà envoyées restent à traiter.'))return;
      const current=generation;busy=true;render();
      try{await request('/settings','PATCH',{enabled});if(current!==generation)return;busy=false;await load();}
      catch(error){if(current===generation){fresh=false;busy=false;render();feedback(`${error.message} Actualisez pour vérifier le réglage avant de réessayer.`);}}
      finally{if(current===generation)busy=false;}
    }
    async function externalAction(button) {
      if(busy||loading||!fresh||button.disabled)return;
      const action=button.dataset.externalAction,id=button.dataset.externalId;
      if(action==='cancel'&&button.dataset.confirmed!=='yes'){button.dataset.confirmed='yes';button.textContent='Confirmer l’annulation dans Krokli uniquement';return;}
      const current=generation;busy=true;render();
      try{await request(`/external-deliveries/${encodeURIComponent(id)}/${action}`,'POST',{confirmed:true});if(current!==generation)return;busy=false;await load();}
      catch(error){if(current===generation){fresh=false;busy=false;render();feedback(`${error.message} Actualisez avant de réessayer.`);}}
      finally{if(current===generation)busy=false;}
    }
    root.addEventListener('click', event => { const button = event.target.closest('[data-dispatch-assign]'); if (button && !button.disabled) void assign(button.dataset.dispatchAssign); if(event.target.closest('[data-dispatch-toggle]'))void toggleAutomatic(); const external=event.target.closest('[data-external-action]');if(external)void externalAction(external); });
    function clear() {
      generation++;
      data = null; fresh = busy = loading = false; lastRender = '';
      selections.clear();
      externalImport?.clear();
      for (const selector of ['[data-dispatch-settings]','[data-dispatch-scheduled]','[data-dispatch-metrics]', '[data-dispatch-ready]', '[data-dispatch-assigned]', '[data-dispatch-drivers]']) q(selector).innerHTML = '';
      feedback('');
    }
    return { load, clear };
  }
  return { create, markup, activeStatuses };
})();
