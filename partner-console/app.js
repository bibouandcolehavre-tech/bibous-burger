/* Standalone local prototype: no API, customers, credentials or live services. */
(() => {
  'use strict';
  const M = window.PartnerModel, $ = id => document.getElementById(id);
  const KEY = 'bibou-partner-prototype-v1';
  const ephemeral = new URLSearchParams(location.search).get('session') === 'verification';
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paths = {
    bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    store: '<path d="M3 10 5 3h14l2 7M4 11v10h16V11M9 21v-7h6v7"/><path d="M3 10c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0H3Z"/>',
    truck: '<path d="M2 5h12v12H2V5Zm12 5h5l3 4v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5m10-5v5M3 11h18m-14 4h3m4 0h3"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-3-5.5 3 1-6.2L3 9.6l6.2-.9L12 3Z"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3c3 1 4 3 4 6"/>',
    crown: '<path d="m3 6 5 5 4-7 4 7 5-5-2 13H5L3 6Zm2 15h14"/>',
    message: '<path d="M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2Z"/><path d="M7 8h10M7 12h7"/>',
    bell: '<path d="M4 17h16l-2-4V8a6 6 0 0 0-12 0v5l-2 4ZM9 21h6"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
    shield: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',
    link: '<path d="m10 7 3-3a5 5 0 0 1 7 7l-3 3m-3 3-3 3a5 5 0 0 1-7-7l3-3m1 6 8-8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
    cursor: '<path d="m4 3 16 10-8 1-3 8-5-19Z"/>', arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  };
  const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.grid}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
  let storageFailure = '', state;
  function readStore() {
    const raw = localStorage.getItem(KEY);
    return raw ? M.restore(JSON.parse(raw)) : M.initial();
  }
  try { state = ephemeral ? M.initial() : readStore(); }
  catch { state = M.initial(); storageFailure = 'La sauvegarde locale est inaccessible ou invalide. Rien ne sera écrasé. Utilise un autre navigateur pour un nouvel essai.'; }
  let selected = state.restaurants[0].id, tab = 'modules', nextRestaurant = null, toastTimer;
  const drafts = new Map();
  const current = () => state.restaurants.find(r => r.id === selected);
  const draft = () => drafts.get(selected) || current();
  const changes = () => M.differences(current(), draft());
  const count = r => M.MODULES.filter(m => r.modules[m.id]).length;
  const initials = r => r.name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => Array.from(s)[0]).join('').toUpperCase();
  const badge = r => `<span class="monogram" style="background:${r.accent}">${esc(initials(r))}</span>`;
  const hasDraft = id => drafts.has(id) && M.differences(state.restaurants.find(r => r.id === id), drafts.get(id)).length;
  function toast(text) {
    clearTimeout(toastTimer); $('toast').textContent = text; $('toast').classList.add('visible');
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 6500);
  }
  if (ephemeral) document.querySelector('.sandbox-notice p').textContent = 'Vérification isolée : aucun essai de cet onglet n’est enregistré dans votre navigateur.';

  function renderCards() {
    const query = $('search').value.trim().toLocaleLowerCase('fr');
    const visible = state.restaurants.filter(r => `${r.name} ${r.city}`.toLocaleLowerCase('fr').includes(query));
    $('restaurant-count').textContent = $('nav-count').textContent = state.restaurants.length;
    $('list-count').textContent = String(visible.length).padStart(2, '0');
    $('restaurant-cards').innerHTML = visible.length ? visible.map(r => `<button class="restaurant-card${selected === r.id ? ' selected' : ''}" data-restaurant="${r.id}" aria-pressed="${selected === r.id}" aria-label="Configurer ${esc(r.name)}"><span class="card-line">${badge(r)}<span><strong>${esc(r.name)}</strong><small>${esc(r.city)}</small></span>${hasDraft(r.id) ? '<span class="draft-dot" title="Brouillon non enregistré"></span>' : ''}</span><span class="card-bottom"><span class="chip">Fictif</span><span class="modules-number"><i class="dot"></i>${count(r)} modules actifs</span></span></button>`).join('') : '<p class="empty-search">Aucun établissement ne correspond à cette recherche.</p>';
  }
  function renderHeading() {
    const r = draft();
    $('editor-heading').innerHTML = `<div class="editor-title">${badge(r)}<div><h2>${esc(r.name)}</h2><p>${esc(r.city)} · ${esc(r.kind)}</p></div><span class="chip">Non connecté</span></div>`;
    const total = changes().length;
    $('draft-status').textContent = total ? `${total} modification${total > 1 ? 's' : ''} à vérifier` : 'Aucune modification en attente';
    $('draft-status').classList.toggle('dirty', !!total);
    $('review-changes').disabled = !total;
  }
  function renderModules() {
    const r = draft();
    $('editor-panel').innerHTML = `<div class="panel-lead"><div><h3>Composez son application</h3><p>Choisissez les services qui lui correspondent.</p></div><span class="counter">${count(r)} / 9 actifs</span></div>${[...new Set(M.MODULES.map(m => m.group))].map(group => `<h3 class="group-label">${group}</h3>${M.MODULES.filter(m => m.group === group).map(m => `<div class="module-row"><span class="module-icon">${icon(m.icon)}</span><div class="module-copy"><h4>${m.name}${m.required ? '<span class="included">Socle</span>' : ''}</h4><p id="hint-${m.id}">${m.description}</p></div><button class="switch" role="switch" data-module="${m.id}" aria-label="${m.name}" aria-describedby="hint-${m.id}" aria-checked="${r.modules[m.id]}"${m.required ? ' disabled' : ''}></button></div>`).join('')}`).join('')}<div class="dependencies-note">${icon('link')}<span>Les modules liés restent cohérents : l’abonnement nécessite livraison et fidélité. Le récapitulatif présente aussi les changements associés.</span></div>`;
  }
  function renderIdentity() {
    const r = draft();
    $('editor-panel').innerHTML = `<div class="identity-form"><label>Nom du restaurant<input data-field="name" maxlength="60" value="${esc(r.name)}" required></label><div class="form-row"><label>Ville<input data-field="city" maxlength="60" value="${esc(r.city)}" required></label><label>Type de cuisine<input data-field="kind" maxlength="60" value="${esc(r.kind)}" required></label></div><div><p class="color-label">Couleur de signature</p><div class="color-options">${M.COLORS.map((color, i) => `<button class="color-option" data-color="${color}" style="background:${color}" aria-label="Couleur ${['Terracotta', 'Forêt', 'Violette', 'Bleue', 'Miel'][i]}" aria-pressed="${r.accent === color}"></button>`).join('')}</div></div><p class="identity-disclaimer">Cet aperçu explore l’identité du restaurant. Il ne modifie ni une application publiée, ni un compte marchand.</p></div>`;
  }
  function renderPreview() {
    const r = draft(), active = M.MODULES.filter(m => r.modules[m.id] && !m.required);
    $('editor-panel').innerHTML = `<div class="preview-layout"><div class="phone" style="--accent:${r.accent}"><div class="phone-top"></div><h3 class="phone-brand">${esc(r.name)}</h3><p class="phone-city">${esc(r.city)} · ${esc(r.kind)}</p><div class="phone-cover"><p>Un bon moment<br>commence ici.</p><small>LA CARTE DU RESTAURANT</small></div><div class="phone-services">${active.filter(m => ['pickup', 'delivery', 'tables'].includes(m.id)).map(m => `<div class="phone-service">${icon(m.icon)}${m.name}</div>`).join('')}</div>${active.filter(m => !['pickup', 'delivery', 'tables'].includes(m.id)).map(m => `<div class="phone-line"><span>${m.name}</span><span>›</span></div>`).join('')}<div class="phone-bottom"></div></div><div class="preview-note"><span class="preview-label">APERÇU SIMULÉ</span><strong>Une identité. Ses services.</strong>Les modules sélectionnés apparaissent ici. Ce n’est pas une application cliente fonctionnelle et rien n’est publié.</div></div>`;
  }
  function renderEditor() {
    renderHeading();
    document.querySelectorAll('[data-tab]').forEach(el => { el.setAttribute('aria-selected', String(el.dataset.tab === tab)); el.tabIndex = el.dataset.tab === tab ? 0 : -1; });
    $('editor-panel').setAttribute('aria-labelledby', `tab-${tab}`);
    ({ modules: renderModules, identity: renderIdentity, preview: renderPreview })[tab]();
  }
  const changeRows = items => items.map(c => `<div class="change-row"><span>${esc(c.label)}</span><span class="change-values"><del>${esc(c.before)}</del>${icon('arrow')}<strong>${esc(c.after)}</strong></span></div>`).join('');
  function renderHistory() {
    $('history-list').innerHTML = state.history.length ? state.history.map(h => `<article class="history-item"><div class="history-head"><div><h2>${esc(h.name)}</h2><span>Enregistrement local · ${h.changes.length} changement(s)</span></div><time datetime="${esc(h.at)}">${esc(new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(h.at)))}</time></div><div class="history-changes">${changeRows(h.changes)}</div></article>`).join('') : `<div class="empty-history">${icon('clock')}<h2>Tout commence ici.</h2><p>Après vérification et enregistrement, vos modifications apparaîtront dans cet historique local.</p></div>`;
  }
  $('module-catalog').innerHTML = M.MODULES.map(m => `<article class="catalog-card"><span class="module-icon">${icon(m.icon)}</span><h3>${m.name}</h3><p>${m.description}</p><small>${m.required ? 'Socle commun · toujours présent' : m.needs.length ? `Nécessite : ${m.needs.map(id => M.MODULES.find(x => x.id === id).name).join(', ')}` : 'Module indépendant'}</small></article>`).join('');

  function switchRestaurant(id) { selected = id; renderCards(); renderEditor(); }
  $('restaurant-cards').addEventListener('click', e => {
    const target = e.target.closest('[data-restaurant]');
    if (!target || target.dataset.restaurant === selected) return;
    if (changes().length) { nextRestaurant = target.dataset.restaurant; $('leave-dialog').showModal(); }
    else switchRestaurant(target.dataset.restaurant);
  });
  $('stay').onclick = () => $('leave-dialog').close();
  $('switch-restaurant').onclick = () => { $('leave-dialog').close(); switchRestaurant(nextRestaurant); };
  $('search').addEventListener('input', renderCards);
  document.querySelectorAll('[data-view]').forEach(el => el.onclick = () => {
    document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b === el); if (b === el) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    ['restaurants', 'catalog', 'history'].forEach(v => { $(`${v}-view`).hidden = el.dataset.view !== v; });
    $('breadcrumb').textContent = { restaurants: 'Établissements', catalog: 'Bibliothèque de modules', history: 'Historique' }[el.dataset.view];
    renderHistory();
  });
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.onclick = () => { tab = el.dataset.tab; renderEditor(); };
    el.onkeydown = e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); const tabs = ['modules', 'identity', 'preview'], i = tabs.indexOf(tab);
      tab = tabs[e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (i + (e.key === 'ArrowLeft' ? 2 : 1)) % 3];
      renderEditor(); $(`tab-${tab}`).focus();
    };
  });
  $('editor-panel').addEventListener('click', e => {
    const control = e.target.closest('[data-module], [data-color]'); if (!control) return;
    try {
      const before = draft();
      const after = control.dataset.module ? M.toggle(before, control.dataset.module, !before.modules[control.dataset.module]) : { ...M.clone(before), accent: control.dataset.color };
      drafts.set(selected, after); renderEditor(); renderCards();
      const selector = control.dataset.module ? `[data-module="${control.dataset.module}"]` : `[data-color="${control.dataset.color}"]`;
      $('editor-panel').querySelector(selector)?.focus();
      if (M.differences(before, after).length > 1) toast('Les modules nécessaires ont aussi été ajustés. Vérifie le récapitulatif avant d’enregistrer.');
    } catch (e) { toast(e.message); }
  });
  $('editor-panel').addEventListener('input', e => {
    const key = e.target.dataset.field; if (!['name', 'city', 'kind'].includes(key)) return;
    drafts.set(selected, { ...M.clone(draft()), [key]: e.target.value }); renderHeading(); renderCards();
  });
  $('review-changes').onclick = () => {
    try {
      M.validate(draft()); $('save-error').textContent = '';
      $('review-subtitle').textContent = `${draft().name} · ${draft().city}`;
      $('change-list').innerHTML = changeRows(changes()); $('review-dialog').showModal();
    } catch (e) { toast(e.message); }
  };
  $('cancel-review').onclick = () => $('review-dialog').close();
  async function persist(transform) {
    if (storageFailure) throw Error(storageFailure);
    const commit = () => {
      const fresh = ephemeral ? state : readStore(), next = M.restore(transform(fresh));
      if (!ephemeral) localStorage.setItem(KEY, JSON.stringify(next));
      state = next;
    };
    // Serializes cross-tab read/check/write where Web Locks are available.
    if (!ephemeral && navigator.locks) await navigator.locks.request(KEY, commit); else commit();
  }
  $('confirm-save').onclick = async () => {
    const button = $('confirm-save'), pending = M.clone(draft()); button.disabled = true;
    try {
      await persist(fresh => M.save(fresh, pending)); drafts.delete(pending.id);
      $('review-dialog').close(); renderCards(); renderEditor(); renderHistory(); toast('Modifications enregistrées dans la maquette. Aucun service réel n’a été modifié.');
    } catch (e) { $('save-error').textContent = `${e.message} Ton brouillon reste disponible.`; }
    finally { button.disabled = false; }
  };
  $('add-restaurant').onclick = () => { $('add-error').textContent = ''; $('add-dialog').showModal(); };
  $('close-add').onclick = () => $('add-dialog').close();
  $('add-form').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.currentTarget, button = form.querySelector('[type="submit"]'); button.disabled = true;
    const values = Object.fromEntries(new FormData(form)), id = `demo-${crypto.randomUUID()}`;
    try {
      await persist(fresh => M.add(fresh, { ...values, accent: M.COLORS[0] }, id));
      form.reset(); $('add-dialog').close(); switchRestaurant(id); renderHistory(); toast('La fiche fictive est prête. Choisis maintenant ses modules.');
    } catch (e) { $('add-error').textContent = e.message; }
    finally { button.disabled = false; }
  });
  window.addEventListener('storage', e => {
    if (ephemeral || e.key !== KEY) return;
    try { state = readStore(); if (!current()) { selected = state.restaurants[0].id; drafts.clear(); } renderCards(); renderEditor(); renderHistory(); toast('La sauvegarde a changé dans un autre onglet. Les brouillons existants sont conservés.'); }
    catch { storageFailure = 'La sauvegarde a changé et ne peut pas être relue. Recharge la page avant tout enregistrement.'; toast(storageFailure); }
  });
  window.addEventListener('beforeunload', e => { if ([...drafts.keys()].some(hasDraft)) { e.preventDefault(); e.returnValue = ''; } });
  renderCards(); renderEditor(); renderHistory();
  if (storageFailure) toast(storageFailure);
})();
