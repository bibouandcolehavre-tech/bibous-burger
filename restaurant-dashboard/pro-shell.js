/* Browser-only presentation and optional screen wake lock. No API or credentials. */
(() => {
  let authenticated=false, requested=false, wakeLock=null, generation=0;
  const q=selector=>document.querySelector(selector);
  const put=(selector,text)=>{const node=q(selector);if(node&&node.textContent!==text)node.textContent=text;};
  const checkbox=q('#pro-keep-awake');
  const release=async()=>{const held=wakeLock;wakeLock=null;if(held)try{await held.release();}catch{}};
  async function acquire(){
    if(!requested||!authenticated||document.visibilityState!=='visible'||wakeLock)return;
    const epoch=++generation;
    try{
      const held=await navigator.wakeLock.request('screen');
      if(epoch!==generation||!requested||!authenticated||document.visibilityState!=='visible'){await held.release();return;}
      wakeLock=held;put('#pro-awake-feedback','Écran maintenu allumé tant que cette page reste visible.');
      held.addEventListener('release',()=>{if(wakeLock!==held)return;wakeLock=null;put('#pro-awake-feedback',requested?'Maintien de l’écran interrompu par le navigateur. Touchez le bouton pour réessayer.':'');});
    }catch{
      if(epoch!==generation)return;
      requested=false;checkbox.checked=false;
      put('#pro-awake-feedback','Le navigateur n’a pas autorisé le maintien de l’écran. Vérifiez le verrouillage automatique de l’appareil.');
    }
  }
  if(!navigator.wakeLock?.request){checkbox.disabled=true;put('#pro-awake-feedback','Le maintien de l’écran n’est pas disponible dans ce navigateur.');}
  checkbox.addEventListener('change',()=>{requested=checkbox.checked;++generation;if(requested)void acquire();else{void release();put('#pro-awake-feedback','');}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void acquire();else{++generation;void release();}});
  window.addEventListener('pagehide',()=>{++generation;void release();});
  window.KrokliProWeb={
    view(value){const alerts=q('.service-alerts'),destination=q(value==='home'?'#pro-status-home':'#pro-status-global');if(alerts&&destination&&alerts.parentElement!==destination)destination.append(alerts);},
    authenticated(value){authenticated=Boolean(value);if(!authenticated){requested=false;checkbox.checked=false;++generation;void release();put('#pro-pending-count','—');put('#pro-pending-label','Vérification des commandes…');put('#pro-sync','Connexion au restaurant…');const badge=q('#pro-orders-badge');badge.hidden=true;badge.textContent='';}},
    update({waiting,syncedAt,error=false}){
      put('#pro-pending-count',syncedAt?String(waiting):'—');
      put('#pro-pending-label',syncedAt?(waiting>1?'commandes à accepter':'commande à accepter'):'Vérification des commandes…');
      const stale=error||!syncedAt||Date.now()-syncedAt>30000;
      put('#pro-sync',syncedAt?`Dernière synchronisation : ${new Date(syncedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}${stale?' · Actualisation nécessaire':''}`:'Connexion au restaurant…');
      const badge=q('#pro-orders-badge');badge.hidden=!syncedAt||waiting===0;badge.textContent=waiting?String(waiting):'';
    },
    sound(state){
      put('#pro-enable-alerts',state.ready?'Alertes sonores activées':'Activer les alertes de cet écran');
      q('#pro-enable-alerts').disabled=!state.supported;
      put('#pro-alert-feedback',state.ready?'Son autorisé par le navigateur. Gardez cette page ouverte et vérifiez le volume de l’appareil.':!state.supported?'Ce navigateur ne peut pas sonner. Ouvrez le tableau dans Safari ou Chrome.':'Autorisez le son avant le service. Les alertes nécessitent cette page ouverte et le volume de l’appareil.');
    }
  };
})();
