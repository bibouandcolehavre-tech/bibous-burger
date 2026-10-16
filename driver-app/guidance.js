(function(root) {
  'use strict';
  const core = root.KrokliGuidanceCore;
  let target = null, available = false;
  const view = document.querySelector('#guidance-panel');
  const choices = [...document.querySelectorAll('[data-guidance-provider]')];
  const names = { apple: 'Plans Apple', google: 'Google Maps', waze: 'Waze' };
  const launch = document.querySelector('#guidance-launch');
  const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent || '') || (/Macintosh/.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1);
  let saved = null;
  try { saved = localStorage.getItem('krokli-navigation-provider'); } catch { /* Optional non-personal preference. */ }
  let provider = core.preferredProvider(saved, appleMobile);
  function update() {
    const links = core.externalLinks(target);
    choices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.guidanceProvider === provider)));
    launch.textContent = `Ouvrir ${names[provider]}`;
    if (links && available) launch.href = links[provider]; else launch.removeAttribute('href');
    launch.setAttribute('aria-disabled', String(!links || !available));
  }
  function close() {
    target = null; view.hidden = true; launch.removeAttribute('href');
    document.querySelector('#guidance-title').textContent = '';
    document.querySelector('#guidance-address').textContent = '';
    document.querySelector('#guidance-status').textContent = '';
  }
  function open(next) {
    if (!core.externalLinks(next)) return false;
    root.KrokliNavigation?.close(); target = { ...next }; view.hidden = false;
    document.querySelector('#guidance-title').textContent = next.title;
    document.querySelector('#guidance-address').textContent = next.address;
    document.querySelector('#guidance-status').textContent = '';
    update(); view.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true;
  }
  choices.forEach(button => button.addEventListener('click', () => {
    provider = core.preferredProvider(button.dataset.guidanceProvider, appleMobile);
    try { localStorage.setItem('krokli-navigation-provider', provider); } catch { /* Keep the in-memory choice. */ }
    update();
  }));
  launch.addEventListener('click', event => {
    if (!available || !core.externalLinks(target)) { event.preventDefault(); return; }
    // A real anchor and direct user gesture preserve mobile universal-link
    // handling. Never await geolocation/fetch or mark a delivery as completed.
    document.querySelector('#guidance-status').textContent = 'Ouverture du GPS demandée. Vérifie la destination et touche Démarrer / Aller dans le GPS si nécessaire. Reviens dans Krokli pour confirmer les étapes de livraison.';
  });
  document.querySelector('#guidance-close').addEventListener('click', close);
  document.querySelector('#guidance-preview').addEventListener('click', () => { if (target) void root.KrokliNavigation?.open(target); });
  root.KrokliGuidance = { open, close, activeKey: () => target?.key || null, setAvailable: value => { available = value === true; update(); } };
})(window);
