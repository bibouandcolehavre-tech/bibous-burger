(function(global){
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function create({api,token,onUnauthorized,onRewardsChanged}){
  const panel=document.createElement('section');panel.className='paper-card-panel';
  const storageKey='bibou-paper-drafts-v1';let drafts={};try{const stored=JSON.parse(sessionStorage.getItem(storageKey)||'{}');if(stored&&typeof stored==='object'&&!Array.isArray(stored))drafts=stored;}catch{}
  let customerId=null,state=null,generation=0,controller=null,busy=false,feedback='',error=false,lastLoad=0;
  function persist(){try{sessionStorage.setItem(storageKey,JSON.stringify(drafts));}catch{}}
  function draft(kind){const owner=drafts[customerId]||={};return owner[kind]||=(kind==='transfer'?{requestId:crypto.randomUUID(),cardReference:'PC-'+day().replace(/-/g,'')+'-'+crypto.randomUUID().slice(0,8).toUpperCase(),stamps:'1'}:{requestId:crypto.randomUUID(),stamps:'1',ticketDate:day(),ticketReference:''});}
  function controls(kind,max=10){const d=draft(kind);return `<label>Nombre de tampons<select data-paper-field="stamps" data-kind="${kind}">${Array.from({length:max},(_,i)=>`<option value="${i+1}" ${Number(d.stamps)===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label>${kind==='transfer'?`<label>Repère de cette carte<input data-paper-field="cardReference" data-kind="transfer" maxlength="64" value="${escape(d.cardReference)}" required></label><small>Récupérez ou annulez physiquement la carte papier. Ce repère permet de retrouver sa reprise.</small>`:`<label>Date du ticket<input type="date" data-paper-field="ticketDate" data-kind="stamp" value="${escape(d.ticketDate)}" max="${day()}" required></label><label>Référence du ticket<input data-paper-field="ticketReference" data-kind="stamp" value="${escape(d.ticketReference)}" maxlength="64" placeholder="N° du ticket payé" required></label><small>Vérifiez l’achat selon vos règles habituelles. Un même ticket ne peut être compté qu’une fois.</small>`}`;}
  function render(){
   const card=state?.paperCard,active=card?.rewards.filter(r=>r.status==='active')||[];
   panel.innerHTML=`<div class="paper-heading"><div><p class="eyebrow">REPRISE AU COMPTOIR</p><h3>Ancienne carte papier</h3></div><button type="button" class="secondary-button" data-paper-refresh ${busy?'disabled':''}>Actualiser</button></div><p data-paper-feedback role="status" aria-live="polite" class="${error?'paper-error':''}">${escape(feedback)}</p>${!state?'<p>Chargement de l’ancienne carte…</p>':`${card?`<p class="paper-balance"><strong>${card.stamps?card.stamps+' / 10 tampons':'Carte complétée'}</strong>${card.stamps?`Encore ${card.remaining} tampon${card.remaining>1?'s':''} pour un burger offert.`:active.length?'Le cadeau à retirer est affiché ci-dessous.':'Aucun burger en attente de retrait.'}</p>`:'<p>Aucune carte papier reprise sur ce compte.</p>'}<p class="menu-note">Ces anciens tampons restent séparés des points Bibou. Le scan de la carte Wallet ne crédite aucun tampon.</p>${active.map(r=>`<article class="paper-gift"><strong>Un burger offert</strong><code>${escape(r.code)}</code><small>Ancienne carte papier · vérifiez le code présenté par le client.</small><button type="button" data-paper-use="${escape(r.id)}" ${busy?'disabled':''}>Burger remis — utiliser ce code</button></article>`).join('')}<details ${!card&&!state.history.length?'open':''}><summary>Reprendre une carte papier</summary><form data-paper-form="transfer"><fieldset ${busy?'disabled':''}>${controls('transfer')}<button type="submit">Reprendre cette carte</button></fieldset></form></details>${card?.stamps?`<details><summary>Ajouter les tampons d’un achat vérifié</summary><form data-paper-form="stamp"><fieldset ${busy?'disabled':''}>${controls('stamp',card.remaining)}<button type="submit">Ajouter les tampons</button></fieldset></form></details>`:''}<details><summary>Historique des reprises et corrections</summary>${state.history.length?state.history.map(item=>`<article class="paper-history"><strong>${item.kind==='transfer'?'Carte reprise':'Tampons ajoutés'} · ${item.stamps} tampon${item.stamps>1?'s':''}</strong><span>${escape(item.reference)}${item.ticketDate?' · '+escape(item.ticketDate):''}</span><small>${escape(new Date(item.createdAt).toLocaleString('fr-FR'))}${item.cancelledAt?' · Annulée : '+escape(item.cancelReason):''}</small>${item.cancellable?`<form data-paper-cancel="${escape(item.id)}"><label>Corriger cette saisie<select name="reason"><option>Erreur de saisie</option><option>Mauvais compte</option><option>Mauvais nombre de tampons</option></select></label><button type="submit" class="secondary-button" ${busy?'disabled':''}>Annuler cette saisie</button></form>`:''}</article>`).join(''):'<p>Aucune reprise enregistrée.</p>'}</details>`}`;
  }
  async function request(route,options={}){
   const run=generation,session=token();if(!session){clear({forget:true});onUnauthorized();return null;}
   const pending=new AbortController();controller=pending;const timeout=setTimeout(()=>pending.abort(),15000);
   try{const response=await fetch(api+route,{...options,signal:pending.signal,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session}`}});
    if(run!==generation||session!==token())return null;
    if(response.status===401){clear({forget:true});onUnauthorized();return null;}
    const result=await response.json();if(run!==generation||session!==token())return null;
    if(!response.ok)throw Error(result.error||'Action indisponible.');return result;
   }finally{clearTimeout(timeout);if(run===generation)controller=null;}
  }
  async function load(){if(!customerId||busy)return;const run=generation;
   try{const result=await request(`/dashboard/customers/${encodeURIComponent(customerId)}/paper-card`);if(!result||run!==generation)return;state=result;lastLoad=Date.now();render();}
   catch(e){if(run===generation){feedback=e.name==='AbortError'?'La fiche met trop de temps à arriver. Réessayez Actualiser.':e.message;error=true;render();}}
  }
  async function mutate(route,body,kind){if(busy)return;busy=true;feedback='Enregistrement…';error=false;render();const run=generation;
   try{const result=await request(route,{method:'POST',body:JSON.stringify(body)});if(!result||run!==generation)return;
    state=result;if(kind)delete drafts[customerId]?.[kind];persist();feedback=result.replayed?'Saisie déjà enregistrée : aucun tampon ni cadeau ajouté une seconde fois.':'Enregistré. Les points actuels restent inchangés.';lastLoad=Date.now();onRewardsChanged();
   }catch(e){if(run===generation){feedback=e.name==='AbortError'?'Résultat incertain. Réessayez le même formulaire : sa référence protège des doublons.':e.message;error=true;}}
   finally{if(run===generation){busy=false;render();}}
  }
  panel.addEventListener('input',event=>{const field=event.target.dataset.paperField,kind=event.target.dataset.kind;if(field&&kind){draft(kind)[field]=event.target.value;persist();}});
  panel.addEventListener('change',event=>{const field=event.target.dataset.paperField,kind=event.target.dataset.kind;if(field&&kind){draft(kind)[field]=event.target.value;persist();}});
  panel.addEventListener('submit',event=>{const form=event.target;event.preventDefault();if(!customerId||busy)return;
   if(form.dataset.paperForm){const kind=form.dataset.paperForm,d=draft(kind);persist();void mutate(`/dashboard/customers/${encodeURIComponent(customerId)}/paper-card/${kind==='transfer'?'transfers':'stamps'}`,{...d,stamps:Number(d.stamps)},kind);}
   else if(form.dataset.paperCancel)void mutate(`/dashboard/customers/${encodeURIComponent(customerId)}/paper-card/operations/${encodeURIComponent(form.dataset.paperCancel)}/cancel`,{reason:form.querySelector('select').value});
  });
  panel.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button||busy)return;if(button.hasAttribute('data-paper-refresh')){feedback='';error=false;void load();}
   if(button.dataset.paperUse){busy=true;const run=generation;render();try{const result=await request(`/dashboard/reward-claims/${encodeURIComponent(button.dataset.paperUse)}`,{method:'PATCH',body:JSON.stringify({status:'used'})});if(!result||run!==generation)return;onRewardsChanged();feedback='Burger enregistré comme remis. Ce code ne pourra plus servir.';error=false;}catch(e){if(run===generation){feedback=e.message;error=true;}}finally{if(run===generation){busy=false;await load();}}}
  });
  function clear({forget=false}={}){++generation;controller?.abort();controller=null;customerId=null;state=null;busy=false;feedback='';lastLoad=0;panel.replaceChildren();panel.remove();if(forget){drafts={};try{sessionStorage.removeItem(storageKey);}catch{}}}
  return {clear,mount(host,id){if(id!==customerId){clear();customerId=id;}host.append(panel);if(!state)render();if(!busy&&Date.now()-lastLoad>20000)void load();},editing:id=>id===customerId&&(busy||panel.contains(document.activeElement))};
 }
 global.BibouPaperCards={create};
})(window);
