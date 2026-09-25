window.BibouSchedule = function ({ root, api, token, onUnauthorized }) {
  const names = { pickup: 'Click & collect', delivery: 'Livraison', reservation: 'Tables' };
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  let date = today(), data = null, draft = null, method = 'pickup', dirty = false, busy = false, epoch = 0;
  root.innerHTML = `<div class="schedule-intro"><h2>Ouvertures et fermetures</h2><p>Les horaires habituels restent inchangés. Ajustez uniquement la date choisie, pour les 14 prochains jours. Heures de Paris.</p></div>
  <div class="schedule-controls"><label>Date du service <input type="date" id="schedule-date"></label><button class="secondary-button" id="schedule-load">Actualiser</button></div>
  <p id="schedule-message" role="status" aria-live="polite"></p><div id="schedule-editor" hidden>
  <div class="schedule-bulk"><strong>Fermer les trois services :</strong><button data-close-period="lunch">Midi (12 h–14 h)</button><button data-close-period="evening">Soir (à partir de 18 h)</button><button data-close-period="all">Journée entière</button></div>
  <div class="schedule-tabs" role="group" aria-label="Service">${Object.entries(names).map(([key,label])=>`<button data-schedule-method="${key}">${label}</button>`).join('')}</div>
  <p>Case cochée = créneau ouvert. Les créneaux hors horaires habituels peuvent être activés. Une heure après minuit appartient au jour suivant.</p>
  <div id="schedule-slots"></div><div class="schedule-summary" id="schedule-summary"></div>
  <label id="schedule-ack-label" hidden><input type="checkbox" id="schedule-ack"> Je prendrai en charge les commandes ou tables déjà prévues. Leur fermeture ne les annule pas.</label>
  <div class="schedule-actions"><button class="secondary-button" id="schedule-reset">Revenir aux horaires habituels pour cette date</button><button class="secondary-button" id="schedule-discard">Annuler mes changements</button><button class="login-button" id="schedule-save" disabled>Enregistrer pour cette date</button></div></div>`;
  const q = s => root.querySelector(s);
  q('#schedule-date').value = date;
  q('#schedule-date').min = today();
  const last = new Date(today()+'T12:00:00Z'); last.setUTCDate(last.getUTCDate()+13); q('#schedule-date').max = last.toISOString().slice(0,10);
  const message = text => { q('#schedule-message').textContent = text; };
  const affected = () => data ? Object.entries(data.services).flatMap(([key,rows])=>rows.filter(r=>r.open&&!draft[key][r.slot]&&r.committed).map(r=>({...r,method:key}))) : [];
  function summary() {
    const counts = Object.entries(names).map(([key,label])=>`${label} : ${Object.values(draft[key]).filter(Boolean).length} créneaux ouverts`);
    const impacts = affected();
    q('#schedule-summary').textContent = counts.join(' · ') + (impacts.length ? ` — Attention : ${impacts.reduce((n,r)=>n+r.committed,0)} commande(s) ou table(s) à prendre en charge sur les créneaux fermés.` : '');
    q('#schedule-ack-label').hidden = !impacts.length;
    q('#schedule-save').disabled = busy || !dirty || (impacts.length > 0 && !q('#schedule-ack').checked);
  }
  function render() {
    if (!data) return;
    root.querySelectorAll('[data-schedule-method]').forEach(button=> {button.classList.toggle('active', button.dataset.scheduleMethod===method);button.setAttribute('aria-pressed',String(button.dataset.scheduleMethod===method));});
    const groups = [['Nuit · 00 h–06 h',0,6],['Matin · 06 h–12 h',6,12],['Midi · 12 h–15 h',12,15],['Après-midi · 15 h–18 h',15,18],['Soir · 18 h–24 h',18,24]];
    q('#schedule-slots').innerHTML = groups.map(([label,start,end])=>`<details ${start>=12?'open':''}><summary>${label}</summary><div class="schedule-grid">${data.services[method].filter(r=>Number(r.slot.slice(0,2))>=start&&Number(r.slot.slice(0,2))<end).map(r=>`<label class="schedule-slot ${r.standard?'':'extra'}"><input type="checkbox" data-slot="${escape(r.slot)}" ${draft[method][r.slot]?'checked':''}><span>${escape(r.slot)}<small>${r.standard?'Habituel':'Hors horaires'}${r.committed?` · ${r.committed} déjà prévu(s)`:''}</small></span></label>`).join('')}</div></details>`).join('');
    q('#schedule-slots').querySelectorAll('[data-slot]').forEach(input=>input.addEventListener('change',()=>{draft[method][input.dataset.slot]=input.checked;dirty=true;q('#schedule-ack').checked=false;summary();}));
    summary();
  }
  function freeze(value) { busy=value;root.querySelectorAll('button,input').forEach(el=>el.disabled=value);if(data)summary(); }
  async function request(path, body) {
    const response=await fetch(api+path,{method:body?'PATCH':'GET',headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});
    if(response.status===401){onUnauthorized('Session expirée. Reconnectez-vous.');throw Error('Session expirée.');}
    const result=await response.json();if(!response.ok)throw Error(result.error||'Impossible de charger les créneaux.');return result;
  }
  function accept(result) {data=result;draft=Object.fromEntries(Object.entries(data.services).map(([key,rows])=>[key,Object.fromEntries(rows.map(r=>[r.slot,r.open]))]));dirty=false;q('#schedule-ack').checked=false;q('#schedule-editor').hidden=false;render();}
  async function load() {
    if(busy)return;
    if(dirty){message('Enregistrez vos changements avant d’actualiser ou de changer de date.');return;}
    const id=++epoch;date=q('#schedule-date').value;data=null;draft=null;q('#schedule-editor').hidden=true;freeze(true);message('Chargement…');
    try{const result=await request('/dashboard/service-schedule?date='+encodeURIComponent(date));if(id!==epoch)return;accept(result);message('Créneaux chargés pour le '+date.split('-').reverse().join('/')+'.');}
    catch(error){if(id===epoch)message(error.message);}finally{if(id===epoch)freeze(false);}
  }
  q('#schedule-load').onclick=load;
  q('#schedule-date').onchange=()=>{if(dirty){q('#schedule-date').value=date;message('Enregistrez vos changements avant de changer de date.');return;}void load();};
  root.querySelectorAll('[data-schedule-method]').forEach(button=>button.onclick=()=>{method=button.dataset.scheduleMethod;render();});
  root.querySelectorAll('[data-close-period]').forEach(button=>button.onclick=()=>{for(const key of Object.keys(names))for(const slot of Object.keys(draft[key])){const hour=Number(slot.slice(0,2));if(button.dataset.closePeriod==='all'||(button.dataset.closePeriod==='lunch'&&hour>=12&&hour<14)||(button.dataset.closePeriod==='evening'&&hour>=18))draft[key][slot]=false;}dirty=true;q('#schedule-ack').checked=false;render();message('Fermeture préparée. Enregistrez pour l’appliquer.');});
  q('#schedule-reset').onclick=()=>{for(const key of Object.keys(names))for(const row of data.services[key])draft[key][row.slot]=row.standard;dirty=true;q('#schedule-ack').checked=false;render();message('Horaires habituels préparés pour cette date. Enregistrez pour les appliquer.');};
  q('#schedule-discard').onclick=()=>{dirty=false;void load();};
  q('#schedule-ack').onchange=summary;
  q('#schedule-save').onclick=async()=>{if(busy||!dirty)return;const id=epoch;const body={date,revision:data.revision,services:draft,acknowledgeExisting:q('#schedule-ack').checked};freeze(true);message('Enregistrement…');try{const result=await request('/dashboard/service-schedule',body);if(id!==epoch)return;accept(result);message('Enregistré : les nouveaux créneaux sont disponibles dans l’application.');}catch(error){if(id===epoch)message(error.message);}finally{if(id===epoch)freeze(false);}};
  return { load, clear(){epoch++;data=null;draft=null;dirty=false;busy=false;q('#schedule-editor').hidden=true;message('');} };
};
