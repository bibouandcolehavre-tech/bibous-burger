/* Real restaurant service controls. No state is changed until staff confirms. */
window.BibouModules = function ({ root, api, token, onUnauthorized }) {
  const services = [
    { id: 'pickup', icon: '🛍', title: 'Click & collect', detail: 'Nouvelles commandes à retirer' },
    { id: 'delivery', icon: '🛵', title: 'Livraison', detail: 'Nouvelles commandes à livrer' },
    { id: 'tables', icon: '🍽', title: 'Réservations', detail: 'Nouvelles demandes de table' }
  ];
  let saved = null;
  let draft = null;
  let busy = false;
  let requestId = 0;
  let confirmingSave = false;
  let confirmingDiscard = false;

  root.className = 'marketing-panel module-panel';
  root.innerHTML = `<div class="module-panel-heading"><div><p class="eyebrow">BIBOU’S BURGERS · SERVICES RÉELS</p><h2>Quels services acceptez-vous ?</h2><p>Fermer un service arrête seulement les nouvelles demandes. Les commandes et réservations déjà reçues restent dans votre tableau.</p></div><span id="module-state" class="module-state">Chargement…</span></div><div id="module-choices" class="module-choices"></div><p id="module-feedback" class="module-feedback" role="status" aria-live="polite"></p><div class="module-panel-actions"><button type="button" id="module-refresh" class="secondary-button">Actualiser</button><button type="button" id="module-save" class="login-button" disabled>Appliquer les changements</button></div><p class="crm-hint">Ces interrupteurs pilotent le serveur du restaurant, pas une simple maquette. Les services fermés restent visibles dans l’application Android déjà publiée jusqu’à sa prochaine mise à jour ; le serveur refuse toute nouvelle demande correspondante.</p>`;
  const $ = selector => root.querySelector(selector);
  const feedback = value => { $('#module-feedback').textContent = value; };
  const changed = () => saved ? services.filter(service => draft[service.id] !== saved.modules[service.id]) : [];
  const render = () => {
    $('#module-state').textContent = saved ? `${services.filter(service => saved.modules[service.id]).length} services ouverts` : 'Indisponible';
    $('#module-choices').replaceChildren(...services.map(service => {
      const row = document.createElement('div');
      row.className = 'module-choice';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `${service.icon} ${service.title}`;
      const detail = document.createElement('span');
      detail.textContent = service.detail;
      copy.append(title, detail);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'module-switch';
      button.dataset.module = service.id;
      button.setAttribute('role', 'switch');
      button.setAttribute('aria-label', service.title);
      button.setAttribute('aria-checked', String(Boolean(draft?.[service.id])));
      button.disabled = busy || !saved;
      button.textContent = draft?.[service.id] ? 'Ouvert' : 'Fermé';
      row.append(copy, button);
      return row;
    }));
    $('#module-refresh').disabled = busy;
    $('#module-refresh').textContent = confirmingDiscard ? 'Confirmer l’abandon' : 'Actualiser';
    $('#module-save').disabled = busy || !changed().length;
    $('#module-save').textContent = confirmingSave ? 'Oui, appliquer au restaurant' : changed().length ? `Appliquer ${changed().length} changement${changed().length > 1 ? 's' : ''}` : 'Aucun changement à appliquer';
  };

  async function request(method = 'GET', body) {
    const activeToken = token();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${api}/dashboard/service-modules`, {
        method,
        cache: 'no-store',
        headers: { Authorization: `Bearer ${activeToken}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal
      });
      if (activeToken !== token()) throw new Error('La session a changé. Rechargez la page.');
      if (response.status === 401) { onUnauthorized(); throw new Error('Reconnectez-vous.'); }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.error || 'Réglage indisponible.'), { status: response.status });
      if (!Number.isSafeInteger(payload.revision) || !payload.modules || services.some(service => typeof payload.modules[service.id] !== 'boolean')) throw new Error('Réponse du serveur invalide. Aucun changement affiché.');
      return payload;
    } finally { clearTimeout(timeout); }
  }

  async function load({ discard = false } = {}) {
    if (busy || !token()) return;
    if (changed().length && !discard) return feedback('Un changement n’est pas encore appliqué. Appliquez-le ou actualisez pour l’abandonner.');
    const id = ++requestId;
    busy = true; render(); feedback('Lecture de la configuration du restaurant…');
    try {
      const result = await request();
      if (id !== requestId) return;
      saved = result;
      draft = { ...result.modules };
      confirmingSave = confirmingDiscard = false;
      feedback('État réel du restaurant actualisé.');
    } catch (error) {
      if (id === requestId) feedback(error.name === 'AbortError' ? 'Réponse trop lente. Réessayez.' : error.message);
    } finally { if (id === requestId) { busy = false; render(); } }
  }

  root.addEventListener('click', event => {
    const id = event.target.closest('[data-module]')?.dataset.module;
    if (!saved || busy || !services.some(service => service.id === id)) return;
    draft[id] = !draft[id];
    confirmingSave = confirmingDiscard = false;
    render();
    feedback(changed().length ? 'Changement préparé, pas encore appliqué au restaurant. Vérifiez puis appliquez.' : 'Aucune modification en attente.');
  });
  $('#module-refresh').addEventListener('click', () => {
    if (changed().length && !confirmingDiscard) {
      confirmingDiscard = true;
      confirmingSave = false;
      render();
      return feedback('Cliquer à nouveau sur « Confirmer l’abandon » effacera seulement vos changements non appliqués.');
    }
    confirmingDiscard = false;
    void load({ discard: true });
  });
  $('#module-save').addEventListener('click', async () => {
    if (busy || !changed().length) return;
    const changes = changed();
    const lines = changes.map(service => `${service.title} : ${draft[service.id] ? 'ouvrir' : 'fermer'}`).join('\n');
    if (!confirmingSave) {
      confirmingSave = true;
      confirmingDiscard = false;
      render();
      return feedback(`Confirmer pour Bibou’s Burgers : ${lines.replaceAll('\n', ' ; ')}. Les demandes déjà reçues restent accessibles.`);
    }
    confirmingSave = false;
    const id = ++requestId;
    const input = { revision: saved.revision, modules: Object.fromEntries(changes.map(service => [service.id, draft[service.id]])) };
    busy = true; render(); feedback('Enregistrement sur le serveur…');
    try {
      const result = await request('PATCH', input);
      if (id !== requestId) return;
      saved = result;
      draft = { ...result.modules };
      feedback('Changements appliqués. Les nouvelles demandes suivent ces réglages.');
    } catch (error) {
      if (id === requestId) feedback(error.status === 409 ? 'Un autre appareil a changé les réglages. Actualisez avant de réessayer.' : error.name === 'AbortError' ? 'Réponse incertaine : actualisez pour vérifier l’état réel avant de réessayer.' : error.message);
    } finally { if (id === requestId) { busy = false; render(); } }
  });
  render();
  return {
    load,
    clear() { requestId++; saved = draft = null; busy = confirmingSave = confirmingDiscard = false; render(); feedback(''); }
  };
};
