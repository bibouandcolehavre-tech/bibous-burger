/* Shell only: no client records, session tokens or API responses are cached here. */
(() => {
  const routes = new Set(['home','tools','account','orders','dispatch','reservations','rewards','menu','backups','customers','marketing','promotions','notifications','marketing-sms','crm','settings','schedule','statistics']);
  const labels = {home:'Accueil',tools:'Rubriques',account:'Mon compte',orders:'Commandes',dispatch:'Répartition des livreurs',reservations:'Réservations',rewards:'Récompenses',menu:'Carte & produits',backups:'Sauvegardes',customers:'Clients & fidélité',marketing:'Marketing',promotions:'Codes promo',notifications:'Notifications', 'marketing-sms':'SMS commerciaux',crm:'Offres & statistiques',settings:'Réglages',schedule:'Créneaux',statistics:'Statistiques'};
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
      window.KrokliProWeb?.view(view);
      document.querySelector('#app-current').textContent = view === 'orders' && filter === 'Historique' ? 'Historique' : labels[view];
      const selectedTab=['home','orders','account'].includes(view)?view:'tools';
      document.querySelectorAll('.pro-bottom-tabs [data-jump]').forEach(button=>button.setAttribute('aria-current',button.dataset.jump===selectedTab?'page':'false'));
      if (!fromHistory && location.hash !== `#${view}`) history.pushState(null, '', `#${view}`);
      if (view === 'home') {
        document.querySelector('#dashboard-title').textContent = 'Votre service';
        document.querySelector('#view-description').textContent = 'Votre restaurant, à portée de main.';
      }
      if (moved) {
        window.scrollTo({top:0,behavior:'instant'});
        if (view === 'customers') document.querySelector('#customers-view').scrollIntoView({block:'start',behavior:'instant'});
        const heading = document.querySelector(view === 'customers' ? '#customer-directory-title' : '#dashboard-title');
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
