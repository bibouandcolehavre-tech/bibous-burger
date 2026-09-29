/* Uses server-provided hours, without changing booking intervals or capacity. */
(function (global) {
  const names = { pickup:'Click & collect', delivery:'Livraison', reservation:'Tables' };
  const periods = { lunch:['Midi',12,15], evening:['Soir',18,24], other:['Autres heures',0,24] };
  const inPeriod = (slot, period) => {
    const hour = Number(slot.slice(0,2));
    return period === 'other' ? hour < 12 || (hour >= 15 && hour < 18) : hour >= periods[period][1] && hour < periods[period][2];
  };
  const makeDraft = data => Object.fromEntries(Object.entries(data.services).map(([key,rows]) => [key,Object.fromEntries(rows.map(row => [row.slot,row.open]))]));
  const changes = (data,draft) => data ? Object.entries(data.services).flatMap(([method,rows]) => rows.filter(row => row.open !== draft[method][row.slot]).map(row => ({...row,method,nextOpen:draft[method][row.slot]}))) : [];
  const impacts = (data,draft) => changes(data,draft).filter(row => !row.nextOpen && row.committed > 0);
  if (typeof module === 'object' && module.exports) module.exports = {inPeriod,makeDraft,changes,impacts};
  if (!global) return;
  global.BibouSchedule = function ({root,api,token,onUnauthorized}) {
    const escape = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    let date=today(),data=null,draft=null,method='pickup',period='lunch',selected=null,busy=false,epoch=0,reviewing=false;
    root.innerHTML = `<div class="schedule-intro"><h2>Trois choix, et c’est réglé.</h2><p>Choisissez la date, le service et l’heure. Vos changements ne concernent que ce jour.</p></div>
      <div class="planner-controls"><label><b>1</b> Quel jour ?<input type="date" id="schedule-date"></label><div><strong><b>2</b> Quel moment ?</strong><div class="planner-segment" aria-label="Moment du service">${Object.entries(periods).map(([id,[label]])=>`<button data-period="${id}">${label}</button>`).join('')}</div></div></div>
      <p id="schedule-message" role="status" aria-live="polite"></p><div id="schedule-editor" hidden>
      <div class="planner-methods" aria-label="Service à modifier">${Object.entries(names).map(([key,name],index)=>`<button data-schedule-method="${key}"><span>${['▣','↗','♧'][index]}</span><strong>${name}</strong><small>${['Retrait au restaurant','Commandes livrées','Réservations de table'][index]}</small></button>`).join('')}</div>
      <div class="planner-workspace"><section class="workspace-panel"><div class="workspace-heading"><h3 id="planner-title">3 · Choisissez une heure</h3><span class="planner-legend">● Ouvert &nbsp; ○ Fermé</span></div>
      <div class="planner-bulk"><button id="schedule-close-period">Fermer cette période</button><button id="schedule-open-period">Ouvrir cette période</button></div>
      <p class="planner-help">Vert : ouvert aux nouvelles demandes. Gris : fermé. Un point orange indique un changement non enregistré.</p>
      <div id="schedule-slots" class="planner-slots"></div><div id="schedule-detail" class="planner-detail"></div></section>
      <aside class="workspace-panel planner-preview"><p class="eyebrow">APRÈS VOS CHANGEMENTS</p><h3 id="schedule-preview-title"></h3><p id="schedule-preview-date"></p><div id="schedule-preview-slots"></div><small>Les heures fermées ne pourront plus être choisies. Les autres restent soumises au délai de préparation, aux places disponibles et à l’heure actuelle.</small></aside></div>
      <div class="planner-preserve">✓ Les commandes et réservations déjà reçues ne sont jamais annulées ici.</div>
      <div class="planner-footer"><div><strong id="schedule-summary"></strong><small>Rien n’est appliqué avant votre confirmation.</small></div><div class="planner-footer-actions"><button class="secondary-button" id="schedule-discard">Annuler les changements</button><button class="primary-button" id="schedule-review">Vérifier les changements →</button></div></div>
      <section class="planner-review workspace-panel" id="schedule-review-panel" hidden aria-label="Vérifier avant de confirmer" tabindex="-1"><p class="eyebrow">DERNIÈRE VÉRIFICATION</p><h3 id="schedule-review-title"></h3><ul id="schedule-review-list"></ul><p id="schedule-impact"></p><label id="schedule-ack-label" hidden><input type="checkbox" id="schedule-ack"> Je prendrai en charge les commandes ou tables déjà prévues. Leur fermeture ne les annule pas.</label><div class="planner-footer-actions"><button class="secondary-button" id="schedule-back">Revenir</button><button class="primary-button" id="schedule-save">Confirmer et enregistrer</button></div></section>
      <details class="planner-advanced"><summary>Autres actions pour cette date</summary><p>Ces actions concernent les trois services, uniquement pour la date choisie.</p><button class="secondary-button" id="schedule-close-day">Préparer la fermeture de toute la journée</button><button class="secondary-button" id="schedule-reset">Revenir aux horaires habituels pour cette date</button></details></div>`;
    const q = selector => root.querySelector(selector);
    q('#schedule-date').value=date;
    function dateBounds() {
      q('#schedule-date').min=today(); const last=new Date(today()+'T12:00:00Z'); last.setUTCDate(last.getUTCDate()+13);
      q('#schedule-date').max=last.toISOString().slice(0,10);
    }
    dateBounds();
    const message = text => {q('#schedule-message').textContent=text;};
    const changed = () => {reviewing=false;q('#schedule-ack').checked=false;render();message('Changement préparé. Vérifiez le récapitulatif pour l’enregistrer.');};
    function summary() {
      const count=changes(data,draft).length;
      q('#schedule-summary').textContent=count?`${count} horaire${count>1?'s':''} à modifier`:'Aucun changement en attente';
      q('#schedule-review').disabled=busy||!count;q('#schedule-discard').disabled=busy||!count;
      q('#schedule-save').disabled=busy||!count||!reviewing||(impacts(data,draft).length>0&&!q('#schedule-ack').checked);
    }
    function render() {
      root.querySelectorAll('[data-period]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.period===period)));
      if(!data)return;
      root.querySelectorAll('[data-schedule-method]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.scheduleMethod===method)));
      const rows=data.services[method].filter(row=>inPeriod(row.slot,period));
      q('#planner-title').textContent=`${names[method]} · ${periods[period][0]}`;
      q('#schedule-slots').innerHTML=rows.map(row=>{
        const opened=draft[method][row.slot],pending=opened!==row.open;
        return `<button class="planner-slot ${opened?'is-open':'is-closed'}" data-slot="${escape(row.slot)}" aria-pressed="${row.slot===selected}" aria-label="${escape(row.slot)} : ${opened?'ouvert':'fermé'}${pending?', changement non enregistré':''}"><strong>${escape(row.slot)}</strong><span>${opened?'● Ouvert':'○ Fermé'}</span><small>${row.committed?`${row.committed} déjà prévu(s)`:row.standard?'Horaire habituel':'Hors horaires habituels'}</small>${pending?'<i aria-hidden="true">●</i>':''}</button>`;
      }).join('')||'<p>Aucun créneau sur cette période.</p>';
      q('#schedule-slots').querySelectorAll('[data-slot]').forEach(button=>button.onclick=()=>{selected=button.dataset.slot;render();});
      const row=rows.find(row=>row.slot===selected);
      q('#schedule-detail').innerHTML=row?`<div><h3>${escape(row.slot)} · ${draft[method][row.slot]?'ouvert':'fermé'}</h3><p>${row.committed?`${row.committed} demande(s) déjà reçue(s) à prendre en charge.`:'Aucune commande ou table déjà prévue à cette heure.'}</p></div><button class="${draft[method][row.slot]?'planner-close':'planner-open'}" id="schedule-toggle">${draft[method][row.slot]?'Fermer cet horaire':'Rouvrir cet horaire'}</button>`:'<p>↑ Cliquez sur une heure pour la fermer ou la rouvrir.</p>';
      if(row)q('#schedule-toggle').onclick=()=>{draft[method][row.slot]=!draft[method][row.slot];changed();};
      q('#schedule-preview-title').textContent=names[method];q('#schedule-preview-date').textContent=date.split('-').reverse().join('/')+' · '+periods[period][0];
      q('#schedule-preview-slots').innerHTML=rows.map(row=>`<span class="${draft[method][row.slot]?'':'closed'}">${escape(row.slot)}</span>`).join('');
      q('#schedule-review-panel').hidden=!reviewing;
      q('#schedule-close-period').textContent=`Fermer ${names[method].toLocaleLowerCase('fr')} · ${periods[period][0].toLocaleLowerCase('fr')}`;
      summary();
    }
    function freeze(value) {busy=value;root.querySelectorAll('button,input').forEach(el=>{el.disabled=value;});if(data)summary();}
    async function request(path,body) {
      const auth=token();
      const response=await fetch(api+path,{method:body?'PATCH':'GET',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});
      if(auth!==token())throw Error('Session modifiée. Reconnectez-vous.');
      if(response.status===401){onUnauthorized('Session expirée. Reconnectez-vous.');throw Error('Session expirée.');}
      const result=await response.json();if(auth!==token())throw Error('Session modifiée.');if(!response.ok)throw Error(result.error||'Les créneaux n’ont pas pu être chargés.');return result;
    }
    function accept(result){data=result;draft=makeDraft(data);reviewing=false;q('#schedule-ack').checked=false;q('#schedule-editor').hidden=false;render();}
    async function load(){
      if(busy||!token())return;
      if(changes(data,draft).length){message('Vos changements sont conservés. Confirmez-les ou annulez-les avant d’actualiser.');return;}
      const id=++epoch;dateBounds();date=q('#schedule-date').value;data=draft=null;selected=null;q('#schedule-editor').hidden=true;freeze(true);render();message('Chargement des horaires…');
      try{const result=await request('/dashboard/service-schedule?date='+encodeURIComponent(date));if(id!==epoch)return;accept(result);message('Horaires chargés · heure de Paris.');}
      catch(error){if(id===epoch)message(error.message);}finally{if(id===epoch)freeze(false);}
    }
    q('#schedule-date').onchange=()=>{if(changes(data,draft).length){q('#schedule-date').value=date;message('Enregistrez ou annulez vos changements avant de changer de date.');return;}void load();};
    root.querySelectorAll('[data-period]').forEach(button=>button.onclick=()=>{period=button.dataset.period;selected=null;render();});
    root.querySelectorAll('[data-schedule-method]').forEach(button=>button.onclick=()=>{method=button.dataset.scheduleMethod;selected=null;render();});
    function setPeriod(open){if(!data||busy)return;for(const row of data.services[method].filter(row=>inPeriod(row.slot,period)))draft[method][row.slot]=open;changed();}
    q('#schedule-close-period').onclick=()=>setPeriod(false);q('#schedule-open-period').onclick=()=>setPeriod(true);
    q('#schedule-close-day').onclick=()=>{for(const key of Object.keys(names))for(const row of data.services[key])draft[key][row.slot]=false;changed();};
    q('#schedule-reset').onclick=()=>{for(const key of Object.keys(names))for(const row of data.services[key])draft[key][row.slot]=row.standard;changed();};
    q('#schedule-discard').onclick=()=>{draft=makeDraft(data);reviewing=false;void load();};
    q('#schedule-review').onclick=()=>{
      const list=changes(data,draft);if(!list.length||busy)return;
      reviewing=true;q('#schedule-review-title').textContent=`Pour le ${date.split('-').reverse().join('/')} uniquement`;
      q('#schedule-review-list').innerHTML=list.map(row=>`<li>${names[row.method]} · <strong>${escape(row.slot)}</strong> → <b>${row.nextOpen?'Ouvert':'Fermé'}</b></li>`).join('');
      const affected=impacts(data,draft);q('#schedule-ack-label').hidden=!affected.length;
      q('#schedule-impact').textContent=affected.length?`${affected.length} horaire(s) à fermer contiennent déjà des commandes ou tables. Vous devez toujours les honorer.`:'Les commandes et tables déjà reçues restent inchangées.';
      render();q('#schedule-review-panel').focus();q('#schedule-review-panel').scrollIntoView({block:'nearest'});
    };
    q('#schedule-back').onclick=()=>{reviewing=false;render();};q('#schedule-ack').onchange=summary;
    q('#schedule-save').onclick=async()=>{
      if(busy||!reviewing||!changes(data,draft).length||(impacts(data,draft).length&&!q('#schedule-ack').checked))return;
      const id=epoch,body={date,revision:data.revision,services:draft,acknowledgeExisting:q('#schedule-ack').checked};freeze(true);message('Enregistrement…');
      try{const result=await request('/dashboard/service-schedule',body);if(id!==epoch)return;accept(result);message('C’est enregistré ! Les ouvertures et fermetures de cette date sont à jour.');}
      catch(error){if(id===epoch)message(error.name==='TimeoutError'?'Réponse trop lente. Actualisez après avoir annulé le brouillon pour vérifier ce qui a été enregistré.':error.message);}finally{if(id===epoch)freeze(false);}
    };
    global.addEventListener('beforeunload',event=>{if(changes(data,draft).length){event.preventDefault();event.returnValue='';}});
    render();
    return {load,clear(){epoch++;data=draft=null;busy=reviewing=false;q('#schedule-editor').hidden=true;message('');freeze(false);}};
  };
})(typeof window==='undefined'?null:window);
