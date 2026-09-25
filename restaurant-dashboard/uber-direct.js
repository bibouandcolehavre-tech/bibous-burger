window.BibouUber = (()=>{
 let dialog;
 const esc = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money = n=>(Number(n)/100).toFixed(2).replace('.',',')+' €';
 const time = s=>s && Number.isFinite(Date.parse(s))?new Date(s).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Non communiquée';
 const labels={pending:'Recherche de coursier',pickup:'Coursier en route vers le restaurant',pickup_complete:'Commande récupérée',dropoff:'En livraison',delivered:'Livraison terminée',canceled:'Course annulée — commande à traiter',returned:'Commande retournée au restaurant'};
 function clear(){dialog?.remove();dialog=null;}
 function markup(order){
  if(order.method!=='delivery')return '';
  const u=order.uberDirect;
  if(!u && !['preparing','ready'].includes(order.status))return '';
  return `<div class="amendment-notice"><strong>Uber Direct</strong><p>${u?.phase==='created'?labels[u.status] || 'Suivi en cours':u && ['sending','uncertain'].includes(u.phase)?'Demande à vérifier dans Uber Direct. Ne commandez pas un second coursier.':'Choisissez de confier cette livraison à Uber, après vérification du devis.'}</p>${u?.dropoffEta?`<p>Arrivée estimée : ${time(u.dropoffEta)}</p>`:''}<button type="button" data-uber-order="${Number(order.number)}">${u && !['quoted','failed'].includes(u.phase)?'Suivi Uber Direct':'Obtenir un devis Uber Direct'}</button></div>`;
 }
 async function open(order,{api,headers,current,refresh}){
  clear();const modal=document.createElement('dialog');dialog=modal;modal.className='amendment-dialog';
  modal.innerHTML=`<div class="amendment-heading"><h2>Uber Direct · #${Number(order.number)}</h2><button data-close aria-label="Fermer">×</button></div><div data-content>Connexion…</div><p data-error role="alert"></p>`;document.body.append(modal);modal.showModal();modal.querySelector('[data-close]').onclick=clear;modal.addEventListener('cancel',clear);
  const content=modal.querySelector('[data-content]');
  const request=async(route,body)=>{if(!current())throw Error('Session expirée.');const r=await fetch(api+route,{method:body?'POST':'GET',headers,signal:AbortSignal.timeout(25000),...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!current())throw Error('Session expirée.');if(!r.ok)throw Error(d.error || 'Uber Direct indisponible.');return d;};
  const error=e=>{if(modal.isConnected)modal.querySelector('[data-error]').textContent=e.message;};
  const base=`/dashboard/orders/${encodeURIComponent(order.id)}/uber/`;
  function tracking(u){
   content.innerHTML=`<h3>${esc(labels[u.status] || 'Demande à vérifier')}</h3><p>${esc(u.deliveryId || '')}</p><p>Retrait estimé : ${time(u.pickupEta)}<br>Livraison estimée : ${time(u.dropoffEta)}</p>${!u.deliveryId?'<p>Si la réponse a été interrompue, retrouvez la course dans Uber Direct, puis indiquez son identifiant. Aucune nouvelle course ne sera créée.</p><label>Identifiant de la course<input data-id placeholder="del_…" /></label>':''}<button data-sync>Actualiser le suivi Uber</button><p><a href="https://direct.uber.com/" target="_blank" rel="noopener noreferrer">Ouvrir Uber Direct</a> pour joindre le coursier ou annuler la course. Des frais de retour ou d’annulation peuvent s’appliquer.</p>`;
   content.querySelector('[data-sync]').onclick=async e=>{e.target.disabled=true;try{const result=await request(base+'sync',{deliveryId:content.querySelector('[data-id]')?.value.trim()});if(modal.isConnected)tracking(result.uber);await refresh();}catch(err){error(err);e.target.disabled=false;}};
  }
  try{
   const state=await request('/dashboard/uber-status');if(!modal.isConnected)return;
   if(!state.configured){content.innerHTML='<h3>Connexion Uber Direct à terminer</h3><p>Les accès API et le suivi sécurisé ne sont pas encore configurés sur le serveur. Aucun coursier ne peut être demandé depuis cette application pour le moment.</p>';return;}
   if(order.uberDirect && !['quoted','failed'].includes(order.uberDirect.phase)){tracking(order.uberDirect);return;}
   content.innerHTML=`<p>${state.mode==='test'?'<strong>MODE TEST · Aucune course réelle</strong>':'Course facturée au restaurant. Le prix payé par le client reste inchangé.'}</p><p>Destinataire : ${esc(order.customerName)}<br>${esc(order.deliveryAddress?.address)}, ${esc(order.deliveryAddress?.postalCode)} ${esc(order.deliveryAddress?.city)}<br>${esc(order.customerPhone)}</p><p>Créneau client : ${esc(order.serviceDate)} · ${esc(order.slot)}</p><label>Commande prête<select data-minutes><option value="0">Déjà prête</option><option value="10" selected>Dans 10 minutes</option><option value="20">Dans 20 minutes</option><option value="30">Dans 30 minutes</option></select></label><p>Le devis transmet les adresses à Uber. La confirmation transmet aussi le nom, le téléphone et les articles nécessaires à la livraison.</p><button data-quote>Calculer le devis</button><div data-result></div>`;
   const resultBox=content.querySelector('[data-result]');let quote=null;
   content.querySelector('[data-minutes]').onchange=()=>{quote=null;resultBox.innerHTML='';};
   content.querySelector('[data-quote]').onclick=async e=>{e.target.disabled=true;modal.querySelector('[data-error]').textContent='';const minutes=Number(content.querySelector('[data-minutes]').value);try{
    const result=await request(base+'quote',{minutes});if(!modal.isConnected || minutes!==Number(content.querySelector('[data-minutes]').value))return;quote=result.uber.quote;
    resultBox.innerHTML=`<h3>Devis : ${money(quote.fee)}</h3><p>Arrivée estimée chez le client : ${time(quote.dropoffEta)}<br>Devis valable jusqu’au ${time(quote.expires)}.</p><p>En cas d’impossibilité de remise, retour au restaurant ; des frais supplémentaires peuvent s’appliquer.</p><label class="amendment-choice"><input type="checkbox" data-timing />J’ai vérifié l’estimation et prévenu le client si elle diffère de son créneau.</label><button data-dispatch>Confirmer ${money(quote.fee)} et demander le coursier${state.mode==='test'?' de test':''}</button>`;
    resultBox.querySelector('[data-dispatch]').onclick=async buttonEvent=>{
     if(!quote)return;buttonEvent.target.disabled=true;content.querySelector('[data-quote]').disabled=true;content.querySelector('[data-minutes]').disabled=true;
     try{const dispatched=await request(base+'dispatch',{confirm:true,quoteId:quote.id,fee:quote.fee,acknowledgeTiming:resultBox.querySelector('[data-timing]').checked});if(modal.isConnected)tracking(dispatched.uber);await refresh();}
     catch(err){error(err);resultBox.innerHTML='<p>Demande non confirmée. Fermez cette fenêtre puis actualisez la commande avant de continuer : une course peut déjà avoir été créée.</p>';await refresh();}
    };
   }catch(err){error(err);}finally{e.target.disabled=false;}};
  }catch(e){error(e);}
 }
 return {open,markup,clear};
})();
