window.BibouBirthdays = function ({banner,dialog,openButton,api,token,onUnauthorized,onPreparePush}) {
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data=null,busy=false,epoch=0,lastLoad=0,selected=null;
  dialog.innerHTML='<div class="birthday-dialog-bar"><h2 id="birthday-dialog-title">🎂 Anniversaires</h2><button type="button" class="secondary-button" id="birthday-close">Fermer ✕</button></div><p id="birthday-feedback" role="status" aria-live="polite"></p><div id="birthday-content"></div>';
  const q=selector=>dialog.querySelector(selector);
  const message=text=>{q('#birthday-feedback').textContent=text;};
  const day=value=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'long'}).format(new Date(value+'T12:00:00Z'));
  const euro=value=>Number(value).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
  async function request(path='',body) {
    const auth=token();
    const response=await fetch(api+'/dashboard/birthdays'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(12000),...(body?{body:JSON.stringify(body)}:{})});
    if(auth!==token())throw Error('Session modifiée.');
    if(response.status===401){onUnauthorized();throw Error('Reconnectez-vous.');}
    const payload=await response.json();if(!response.ok)throw Error(payload.error||'Anniversaires indisponibles.');return payload;
  }
  function renderBanner() {
    const count=data.todayCustomers.length;
    openButton.textContent=`🎂 Anniversaires${count?' ('+count+')':''}`;
    banner.hidden=!count;
    banner.innerHTML=count?`<div><strong>🎂 ${count===1?'Un anniversaire aujourd’hui':count+' anniversaires aujourd’hui'}</strong><p>${data.todayCustomers.slice(0,3).map(c=>esc(c.name)).join(' · ')}${count>3?' · et '+(count-3)+' autre(s)':''}</p></div><button type="button" class="login-button">Proposer une offre ou un message →</button>`:'';
    banner.querySelector('button')?.addEventListener('click',open);
  }
  function customerCard(c,today) {
    const status={available:'Disponible',used:'Déjà utilisée',reserved:'Paiement en cours',expired:'Expirée',ineligible_birthday:'Non utilisable'};
    return `<article class="birthday-person"><div><h3>${esc(c.name)}</h3>${c.offer?`<p>Offre déjà accordée : <strong>−${c.offer.discountPercent} %</strong> · ${status[c.offer.status]||'À vérifier'}.</p>`:'<p>Aucune nouvelle offre n’est créée sans votre validation.</p>'}</div>${today?`<div class="birthday-actions"><button type="button" class="login-button" data-birthday-offer="${esc(c.id)}" ${c.canOffer?'':'disabled'}>Proposer une réduction</button><button type="button" class="secondary-button" data-birthday-push="${esc(c.id)}" ${c.canPreparePush?'':'disabled'}>Préparer une notification</button></div>${!c.canOffer?`<small>${esc(c.offerReason)}</small>`:''}${!c.canPreparePush?`<small>${esc(c.pushReason)}</small>`:''}`:'<small>À préparer demain, le jour de son anniversaire.</small>'}</article>`;
  }
  function render() {
    if(!data)return;
    q('#birthday-content').innerHTML=`<p class="birthday-date">Aujourd’hui · ${day(data.today)}</p>${data.todayCustomers.length?data.todayCustomers.map(c=>customerCard(c,true)).join(''):'<p class="birthday-empty">Aucun anniversaire renseigné pour aujourd’hui.</p>'}<div id="birthday-offer-editor"></div><h3 class="birthday-upcoming">Demain · ${day(data.tomorrow)}</h3>${data.tomorrowCustomers.length?data.tomorrowCustomers.map(c=>customerCard(c,false)).join(''):'<p class="birthday-empty">Aucun anniversaire renseigné pour demain.</p>'}<p class="birthday-note">Dates déclarées par les clients, heure de Paris. Une réduction personnelle maximum par anniversaire et par an. Aucun message n’est envoyé en ouvrant cet écran.</p><button type="button" id="birthday-reload" class="secondary-button">Actualiser les anniversaires</button>`;
    q('#birthday-content').querySelectorAll('[data-birthday-offer]').forEach(button=>button.addEventListener('click',()=>editOffer(button.dataset.birthdayOffer)));
    q('#birthday-content').querySelectorAll('[data-birthday-push]').forEach(button=>button.addEventListener('click',()=>{const c=data.todayCustomers.find(c=>c.id===button.dataset.birthdayPush);if(!c)return;dialog.close();onPreparePush(c);}));
    q('#birthday-reload').addEventListener('click',()=>load(true));
  }
  function editOffer(id) {
    const c=data.todayCustomers.find(c=>c.id===id);if(!c?.canOffer)return;
    selected=id;const d=data.offerDefaults;
    q('#birthday-offer-editor').innerHTML=`<form id="birthday-offer-form" class="birthday-offer-form"><h3>Une réduction personnelle pour ${esc(c.name)}</h3><label>Titre du bon<input name="title" maxlength="65" required value="${esc(d.title)}"></label><div class="birthday-form-grid"><label>Réduction (%)<input name="discountPercent" type="number" min="1" max="50" step="1" required value="${d.discountPercent??''}" placeholder="À choisir"></label><label>Minimum de produits (€)<input name="minSubtotal" type="number" min="0" max="10000" step="0.01" required value="${d.minSubtotal}"></label><label>Validité (jours)<input name="validityDays" type="number" min="1" max="90" step="1" required value="${d.validityDays}"></label></div><p>Bon réservé à ce client, à usage unique, visible dans Mon compte → Mes offres. La remise la plus avantageuse s’applique : ce bon ne s’additionne pas à la bienvenue ou à la remise Bibou +. La livraison offerte Bibou + reste applicable.</p><label class="birthday-confirm"><input name="confirm" type="checkbox" required> Je confirme cette réduction pour ${esc(c.name)} uniquement.</label><button class="login-button" type="submit">Attribuer cette réduction</button><button class="secondary-button" id="birthday-offer-cancel" type="button">Annuler</button></form>`;
    q('#birthday-offer-cancel').addEventListener('click',()=>{selected=null;q('#birthday-offer-editor').innerHTML='';});
    q('#birthday-offer-form').addEventListener('submit',saveOffer);
    q('#birthday-offer-editor').scrollIntoView({block:'center',behavior:'smooth'});
  }
  async function saveOffer(event) {
    event.preventDefault();if(busy||!selected)return;
    const form=q('#birthday-offer-form'),fields=Object.fromEntries(new FormData(form)),generation=epoch;
    const input={customerId:selected,birthdayDate:data.today,title:fields.title,discountPercent:Number(fields.discountPercent),minSubtotal:Number(fields.minSubtotal),validityDays:Number(fields.validityDays),confirm:fields.confirm==='on'};
    busy=true;form.querySelectorAll('input,button').forEach(el=>{el.disabled=true;});message('Enregistrement de la réduction…');
    try {const result=await request('/offer',input);if(generation!==epoch)return;data=result;selected=null;renderBanner();render();message(result.result.created?'Réduction attribuée au client. Aucune notification envoyée : vous pouvez maintenant en préparer une.':'Cette réduction avait déjà été attribuée. Aucun doublon créé.');}
    catch(error){if(generation===epoch){message(error.message+' En cas de coupure, actualisez pour vérifier : une nouvelle tentative ne créera pas une seconde offre annuelle.');form.querySelectorAll('input,button').forEach(el=>{el.disabled=false;});}}
    finally{if(generation===epoch)busy=false;}
  }
  async function load(force=false) {
    if(!token()||busy||selected||(!force&&Date.now()-lastLoad<60000))return;
    busy=true;const generation=epoch;
    try {const result=await request();if(generation!==epoch)return;data=result;lastLoad=Date.now();renderBanner();render();message('');}
    catch(error){if(generation===epoch){lastLoad=0;banner.hidden=false;banner.innerHTML='<strong>🎂 Anniversaires à vérifier</strong><p>Vérification indisponible. Ouvrez « Anniversaires » pour actualiser ; aucun résultat n’est supposé.</p>';message(error.message);}}
    finally{if(generation===epoch)busy=false;}
  }
  function open(){if(!token())return;if(!dialog.open)dialog.showModal();if(!data)message('Chargement des anniversaires…');void load(true);}
  openButton.addEventListener('click',open);
  q('#birthday-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{if(!busy){selected=null;render();}});
  function clear(){epoch++;data=null;busy=false;lastLoad=0;selected=null;if(dialog.open)dialog.close();banner.hidden=true;banner.innerHTML='';q('#birthday-content').innerHTML='';message('');openButton.textContent='🎂 Anniversaires';}
  return {load,clear,open};
};
