window.BibouPromotions = function ({ root, api, token, onUnauthorized }) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const templates = {
    percent_burger: { title:'−10 % sur un burger', type:'percent_burger', code:'BURGER10', percent:10, minimum:0, message:'−10 % sur le burger choisi. Cumulable avec les 10 % de bienvenue.' },
    percent_order: { title:'−15 % sur la commande', type:'percent_order', code:'MIDI15', percent:15, minimum:25, message:'−15 % sur les produits, dès 25 € de commande. Cumulable avec les 10 % de bienvenue.' },
    bogo_burger: { title:'1 burger acheté = 1 offert', type:'bogo_burger', code:'DUOBURGER', percent:0, minimum:0, message:'Pour deux burgers seuls, le moins cher est offert, hors suppléments. Cumulable avec les 10 % de bienvenue.' },
    buy3_get1_burger: { title:'3 burgers achetés = le 4e offert', type:'buy3_get1_burger', code:'QUATREBURGER', percent:0, minimum:0, combineWelcome:false, message:'Dès quatre burgers seuls, le moins cher est offert, hors suppléments. Non cumulable avec les 10 % de bienvenue. Retire ce code pour choisir la bienvenue.' },
    buy3_get1_menu: { title:'3 menus achetés = le 4e offert', type:'buy3_get1_menu', code:'QUATREMENUS', percent:0, minimum:0, message:'Dès quatre menus burgers, le moins cher est offert, hors suppléments. Cumulable avec les 10 % de bienvenue.' },
    free_delivery: { title:'Livraison offerte', type:'free_delivery', code:'LIVRAISON', percent:0, minimum:30, message:'Livraison offerte dès 30 € de produits. Cumulable avec les 10 % de bienvenue.' },
    flash: { title:'−20 % coup de boost', type:'percent_order', code:'FLASH20', percent:20, minimum:0, usageLimit:50, message:'−20 % sur les produits. Offre limitée. Cumulable avec les 10 % de bienvenue.' }
  };
  let data = null, draft = null, busy = false, pendingActivation = null;
  root.innerHTML = `<div class="menu-intro"><p class="eyebrow">PROMOTIONS</p><h2>Créez vos offres en quelques gestes.</h2><p>Choisissez une idée, fixez ses limites, enregistrez-la, puis activez-la quand vous êtes prêt. Aucun code n’est actif par défaut.</p></div>
    <p id="promo-feedback" class="menu-feedback" role="status" aria-live="polite"></p>
    <div class="promo-layout"><section class="workspace-panel"><h2>Vos codes</h2><div id="promo-list"></div><h3>Nouvelle offre</h3><div id="promo-templates"></div></section>
    <section class="workspace-panel"><h2 id="promo-heading">Choisissez une offre</h2><div id="promo-form"></div></section></div>`;
  const q = selector => root.querySelector(selector);
  const feedback = value => { q('#promo-feedback').textContent = value; };
  const localTime = iso => iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  const isoTime = value => value ? new Date(value).toISOString() : null;
  const newDraft = key => ({ id:undefined, revision:0, enabled:false, oncePerCustomer:true, combineWelcome:true, startsAt:null, endsAt:null, usageLimit:null, productId:null, ...templates[key] });
  async function request(method = 'GET', payload) {
    const response = await fetch(api + '/dashboard/promotions', { method, cache:'no-store', headers:{ Authorization:`Bearer ${token()}`, 'Content-Type':'application/json' }, ...(payload ? { body:JSON.stringify(payload) } : {}) });
    if (response.status === 401) { onUnauthorized(); throw Error('Reconnectez-vous au restaurant.'); }
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Action impossible.');
    return result;
  }
  function renderList() {
    q('#promo-list').innerHTML = data.promotions.length ? data.promotions.map(offer => `<button type="button" class="promo-list-item" data-promo-id="${esc(offer.id)}"><strong>${esc(offer.code)}</strong><span>${offer.enabled ? 'Active' : 'En pause'} · ${offer.used} utilisation${offer.used > 1 ? 's' : ''}</span></button>`).join('') : '<p>Aucun code créé pour le moment.</p>';
    q('#promo-templates').innerHTML = Object.entries(templates).map(([key, item]) => `<button type="button" class="promo-template" data-template="${key}">${esc(item.title)} <span>→</span></button>`).join('');
  }
  function renderForm() {
    pendingActivation = null;
    if (!draft) { q('#promo-form').innerHTML = '<p>Sélectionnez une idée ou un code existant.</p>'; return; }
    q('#promo-heading').textContent = draft.id ? `Modifier ${draft.code}` : 'Créer une nouvelle offre';
    const products = data.burgers.map(item => `<option value="${esc(item.id)}" ${item.id === draft.productId ? 'selected' : ''}>${esc(item.name)}</option>`).join('');
    q('#promo-form').innerHTML = `<div class="promo-fields">
      <label>Code à partager<input data-field="code" maxlength="40" autocomplete="off" value="${esc(draft.code)}" required></label>
      <label>Type d’offre<select data-field="type"><option value="percent_burger" ${draft.type==='percent_burger'?'selected':''}>Réduction sur un burger</option><option value="percent_order" ${draft.type==='percent_order'?'selected':''}>Réduction sur la commande</option><option value="bogo_burger" ${draft.type==='bogo_burger'?'selected':''}>Un burger acheté, un offert</option><option value="buy3_get1_burger" ${draft.type==='buy3_get1_burger'?'selected':''}>Trois burgers seuls achetés, le quatrième offert</option><option value="buy3_get1_menu" ${draft.type==='buy3_get1_menu'?'selected':''}>Trois menus burgers achetés, le quatrième offert</option><option value="free_delivery" ${draft.type==='free_delivery'?'selected':''}>Livraison offerte</option></select></label>
      ${draft.type === 'percent_burger' ? `<label>Burger concerné<select data-field="productId"><option value="">Choisir le burger</option>${products}</select></label>` : ''}
      ${draft.type.startsWith('percent_') ? `<label>Réduction (%)<input data-field="percent" type="number" min="1" max="50" step="1" value="${Number(draft.percent)||10}"></label>` : ''}
      <label>Minimum de produits (€)<input data-field="minimum" type="number" min="0" max="10000" step="0.01" value="${Number(draft.minimum)||0}"></label>
      <label>Début (facultatif)<input data-field="startsAt" type="datetime-local" value="${localTime(draft.startsAt)}"></label>
      <label>Fin (facultatif)<input data-field="endsAt" type="datetime-local" value="${localTime(draft.endsAt)}"></label>
      <label>Nombre total d’utilisations (facultatif)<input data-field="usageLimit" type="number" min="1" max="100000" value="${draft.usageLimit ?? ''}" placeholder="Sans limite"></label>
      <label class="promo-check"><input data-field="oncePerCustomer" type="checkbox" ${draft.oncePerCustomer?'checked':''}> Une utilisation par client</label>
      <label class="promo-check"><input data-field="combineWelcome" type="checkbox" ${draft.combineWelcome !== false?'checked':''}> Cumul avec les 10 % de bienvenue</label>
      <label class="promo-wide">Texte affiché au client<textarea data-field="message" maxlength="180" rows="3">${esc(draft.message)}</textarea></label>
      <p class="promo-wide promo-rule">${draft.combineWelcome !== false ? 'Les 10 % de bienvenue se cumulent avec cette offre sur le montant restant à payer.' : 'Cette offre et les 10 % de bienvenue ne se cumulent pas. Le client choisit cette offre en appliquant le code, ou la bienvenue en le retirant.'} Un seul code promo par commande. Pour les offres « acheté, offert », le produit le moins cher est offert hors suppléments payants. Burgers seuls et menus sont comptés séparément.</p>
    </div><div class="promo-actions"><button type="button" id="promo-save" class="login-button">${draft.enabled ? 'Enregistrer les modifications' : 'Enregistrer en pause'}</button><button type="button" id="promo-toggle" class="secondary-button">${draft.enabled ? 'Mettre en pause' : 'Activer cette offre'}</button></div><div id="promo-confirmation" role="status" aria-live="polite"></div>`;
  }
  function readForm() {
    if (!draft) return;
    q('#promo-form').querySelectorAll('[data-field]').forEach(field => {
      if (field.type === 'checkbox') draft[field.dataset.field] = field.checked;
      else if (field.dataset.field === 'startsAt' || field.dataset.field === 'endsAt') draft[field.dataset.field] = isoTime(field.value);
      else if (field.dataset.field === 'usageLimit') draft.usageLimit = field.value === '' ? null : Number(field.value);
      else if (['percent','minimum'].includes(field.dataset.field)) draft[field.dataset.field] = Number(field.value);
      else draft[field.dataset.field] = field.value;
    });
    if (draft.type !== 'percent_burger') draft.productId = null;
    if (!draft.type.startsWith('percent_')) draft.percent = 0;
  }
  async function save(activate, confirmed = false) {
    if (busy || !draft) return;
    readForm();
    const next = { ...draft, enabled:activate === null ? draft.enabled : activate };
    delete next.title; delete next.used; delete next.createdAt; delete next.updatedAt;
    if (next.enabled && (!confirmed || JSON.stringify(next) !== pendingActivation)) {
      pendingActivation = JSON.stringify(next);
      q('#promo-confirmation').innerHTML = `<div class="workspace-panel"><h3>Activer ${esc(next.code)} ?</h3><p>Les clients pourront utiliser cette offre immédiatement. Vérifiez les dates et les règles ci-dessus avant de confirmer.</p><div class="promo-actions"><button type="button" id="promo-confirm-save" class="login-button">Confirmer l’activation</button><button type="button" id="promo-confirm-cancel" class="secondary-button">Annuler</button></div></div>`;
      feedback('Confirmation nécessaire : aucun changement enregistré pour le moment.');
      return;
    }
    pendingActivation = null;
    next.confirmActivation = next.enabled;
    busy = true; q('#promo-form').querySelectorAll('button').forEach(button => { button.disabled = true; }); feedback('Enregistrement…');
    try { data = await request(next.id ? 'PATCH' : 'POST', next); draft = { ...data.promotions.find(item => item.code === next.code) }; renderList(); renderForm(); feedback(next.enabled ? 'Offre active et enregistrée.' : 'Offre enregistrée en pause.'); }
    catch (error) { feedback(error.message); renderForm(); }
    finally { busy = false; }
  }
  root.addEventListener('click', event => {
    const template = event.target.closest('[data-template]');
    if (template) { draft = newDraft(template.dataset.template); renderForm(); feedback('Nouvelle offre en pause tant que vous ne l’activez pas.'); return; }
    const existing = event.target.closest('[data-promo-id]');
    if (existing) { draft = { ...data.promotions.find(item => item.id === existing.dataset.promoId) }; renderForm(); feedback(''); return; }
    if (event.target.id === 'promo-save') void save(null);
    if (event.target.id === 'promo-toggle') void save(!draft.enabled);
    if (event.target.id === 'promo-confirm-save') void save(true, true);
    if (event.target.id === 'promo-confirm-cancel') { pendingActivation = null; q('#promo-confirmation').innerHTML = ''; feedback('Activation annulée. Aucun changement enregistré.'); }
  });
  root.addEventListener('input', () => { if (pendingActivation) { pendingActivation = null; q('#promo-confirmation').innerHTML = ''; } });
  root.addEventListener('change', event => { if (['type', 'combineWelcome'].includes(event.target.dataset.field)) { readForm(); renderForm(); } });
  return { async load() { if (busy) return; try { data = await request(); renderList(); renderForm(); feedback('Les offres sont à jour.'); } catch (error) { feedback(error.message); } }, clear() { data = draft = pendingActivation = null; q('#promo-list').innerHTML = ''; q('#promo-form').innerHTML = ''; } };
};
