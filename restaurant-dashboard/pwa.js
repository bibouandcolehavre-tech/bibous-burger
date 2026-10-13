/* Shell only: no client records, session tokens or API responses are cached here. */
(() => {
  const routes = new Set(['home','orders','dispatch','reservations','rewards','menu','backups','customers','marketing','promotions','notifications','marketing-sms','crm','settings','schedule','statistics']);
  const labels = {home:'Accueil',orders:'Commandes',dispatch:'Répartition des livreurs',reservations:'Réservations',rewards:'Récompenses',menu:'Carte & produits',backups:'Sauvegardes',customers:'Clients & fidélité',marketing:'Marketing',promotions:'Codes promo',notifications:'Notifications', 'marketing-sms':'SMS commerciaux',crm:'Offres & statistiques',settings:'Réglages',schedule:'Créneaux',statistics:'Statistiques'};
  const route = () => {const candidate = location.hash.slice(1); return routes.has(candidate) ? candidate : 'home';};
  const initialRoute = route();
  let current = 'home', installPrompt = null, fromHistory = false;
  const installed = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const updateInstallation = () => {document.querySelectorAll('[data-install-app]').forEach(button => {button.hidden = installed();});};
  const offline = () => {document.querySelector('#app-offline').hidden = navigator.onLine !== false;};
  window.BibouRestaurantApp = {
    changed(view, filter) {
      if (!routes.has(view)) return;
      const moved = view !== current;
      current = view;
      document.querySelector('#dashboard-app').dataset.page = view;
      document.querySelector('#app-current').textContent = view === 'orders' && filter === 'Historique' ? 'Historique' : labels[view];
      if (!fromHistory && location.hash !== `#${view}`) history.pushState(null, '', `#${view}`);
      if (view === 'home') {
        document.querySelector('#dashboard-title').textContent = 'Que souhaites-tu gérer ?';
        document.querySelector('#view-description').textContent = 'Choisis une rubrique, comme sur la borne.';
      }
      if (moved) {
        window.scrollTo({top:0,behavior:'instant'});
        const heading = document.querySelector('#dashboard-title');
        heading.setAttribute('tabindex','-1'); heading.focus({preventScroll:true});
      }
    },
    start(navigate) {
      if (initialRoute !== current) navigate(initialRoute);
      const restore = () => {const desired = route();if (desired === current) return;fromHistory=true;try {navigate(desired);} finally {fromHistory=false;}};
      window.addEventListener('popstate',restore);
      window.addEventListener('hashchange',restore);
    }
  };
  updateInstallation(); offline();
  window.addEventListener('online',offline); window.addEventListener('offline',offline); window.addEventListener('appinstalled',updateInstallation);
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;document.querySelector('#app-install-confirm').hidden=false;});
  const dialog = document.querySelector('#app-install-dialog');
  document.querySelectorAll('[data-install-app]').forEach(button=>button.addEventListener('click',()=>dialog.showModal()));
  document.querySelector('#app-install-confirm').addEventListener('click',async()=>{
    if (!installPrompt) return;
    const prompt = installPrompt; installPrompt = null;
    try {await prompt.prompt();await prompt.userChoice;} catch {} finally {document.querySelector('#app-install-confirm').hidden=true;dialog.close();updateInstallation();}
  });
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>{});
})();
