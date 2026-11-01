/* Presentation only. Move original cards: never duplicate actions or call the API. */
(() => {
  const root = document.querySelector('#orders-list');
  const app = document.querySelector('#dashboard-app');
  if (!root || !app) return;
  let selected = null, card = null, home = null, anchor = null, refreshing = false, scroll = 0;
  const dialog = document.createElement('dialog');
  dialog.className = 'service-order-dialog';
  dialog.setAttribute('aria-label', 'Détail de la commande');
  dialog.innerHTML = '<div class="service-order-dialog-bar"><strong>Détail de la commande</strong><button type="button" class="service-order-dialog-close" aria-label="Fermer le détail de la commande">✕</button></div><div class="service-order-dialog-content"></div>';
  app.append(dialog);
  const content = dialog.querySelector('.service-order-dialog-content');
  const restore = () => {
    if (!card) return;
    card.classList.remove('in-order-panel');
    card.querySelectorAll('[data-open-service-order]').forEach(button => { button.disabled = false; });
    const target = home?.isConnected ? home : root;
    target.insertBefore(card, anchor?.parentElement === target ? anchor : null);
    card = null; home = null; anchor = null;
  };
  const close = () => {
    const id = selected;
    selected = null;
    restore();
    if (dialog.open) dialog.close();
    if (id) [...root.querySelectorAll('[data-open-service-order]')].find(b => b.dataset.openServiceOrder === id)?.focus({preventScroll:true});
  };
  const show = id => {
    const next = [...root.querySelectorAll('[data-service-order]')].find(n => n.dataset.serviceOrder === id);
    if (!next) { close(); return; }
    selected = id; card = next; home = next.parentElement; anchor = next.nextSibling;
    card.classList.add('in-order-panel');
    card.querySelectorAll('[data-open-service-order]').forEach(button => { button.disabled = true; });
    content.replaceChildren(card);
    const name = card.querySelector('.order-id')?.textContent || 'Commande';
    dialog.setAttribute('aria-label', `Détail de la commande · ${name}`);
    if (!dialog.open) { dialog.showModal(); dialog.scrollTop = 0; }
  };
  dialog.querySelector('.service-order-dialog-close').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => { if (!refreshing && selected) close(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  });
  window.KrokliOrderPresentation = {
    beforeRender() {
      refreshing = true;
      scroll = dialog.scrollTop;
      restore();
    },
    afterRender() {
      root.querySelectorAll('[data-open-service-order]').forEach(button => button.addEventListener('click', () => show(button.dataset.openServiceOrder)));
      root.querySelectorAll('[data-service-order]').forEach(node => node.addEventListener('click', event => { if (!event.target.closest('button,a,details,input,select,textarea') && !node.classList.contains('in-order-panel')) show(node.dataset.serviceOrder); }));
      if (selected) { show(selected); dialog.scrollTop = scroll; }
      refreshing = false;
    },
    clear: close
  };
  const paths = {
    orders: '<path d="M5 6h14v15H5zM8 6V4h8v2M9 10c0 4 6 4 6 0"/>',
    history: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/>',
    scheduled: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v5M16 3v5M4 11h16"/>',
    dispatch: '<circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="m5 17 4-9h5l5 9M9 8l4 9H5M10 4h4"/>',
    tools: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
  };
  document.querySelectorAll('.pro-bottom-tabs [data-jump]').forEach(button => {
    const path = paths[button.dataset.jump];
    if (path) button.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${path}</svg>`);
  });
  const overview = document.querySelector('#service-overview');
  const heading = document.querySelector('.topbar > div');
  if (overview && heading) heading.append(overview);
  const filters = document.querySelector('.service-filter-details');
  const orders = document.querySelector('#orders-view');
  if (filters && orders) orders.append(filters);
  const updateAlerts = () => {
    const alerts = document.querySelector('.service-alerts');
    if (!alerts) return;
    const status = ['#connection-status', '#printer-status', '#arrival-message'].map(s => document.querySelector(s)?.textContent || '').join(' ');
    const sound = document.querySelector('#audio-warning');
    const needsAttention = [...alerts.querySelectorAll('.needs-attention')].some(n => !n.hidden);
    const issue = /⚠|indisponible|impossible|coupée|ancienne|non confirmé|à vérifier|vérifiez|Vérification de l.imprimante|Connexion au restaurant/i.test(status) || (sound && !sound.hidden) || needsAttention;
    alerts.dataset.hasIssue = String(Boolean(issue));
  };
  const alerts = document.querySelector('.service-alerts');
  if (alerts) new MutationObserver(updateAlerts).observe(alerts, {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class']});
  updateAlerts();
})();
