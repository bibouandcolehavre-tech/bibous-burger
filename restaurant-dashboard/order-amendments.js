/* Editor is isolated from the periodically refreshed order list. */
window.BibouAmendments = (() => {
  let dialog;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => Number(n).toFixed(2).replace('.', ',') + ' €';
  const groups = { protein:'Protéine', salad:'Crudités', sauces:'Sauce', drink:'Boisson du menu', extras:'Suppléments', sides:'Accompagnements ajoutés', desserts:'Desserts', 'duo-drink-one':'Première boisson', 'duo-drink-two':'Deuxième boisson' };
  function clear() { dialog?.remove(); dialog = null; }
  async function open(order, { api, headers, current, refresh }) {
    clear();
    const modal = document.createElement('dialog'); dialog = modal;
    modal.className = 'amendment-dialog';
    modal.innerHTML = `<div class="amendment-heading"><h2>Modifier la commande #${Number(order.number)}</h2><button type="button" data-close aria-label="Fermer">×</button></div><p>Proposez un remplacement, retirez un article ou ajustez sa quantité. Le client devra revalider avant la préparation.</p><p>Sans réponse avant l’heure indiquée (30 minutes maximum), la commande sera annulée. Tout remboursement reste à effectuer dans SumUp.</p><div data-editor>Chargement…</div><p data-error role="alert"></p>`;
    document.body.append(modal); modal.showModal();
    modal.querySelector('[data-close]').onclick = clear;
    modal.addEventListener('cancel', clear);
    const request = async (path, body) => {
      if (!current()) throw Error('Votre session a changé. Reconnectez-vous.');
      const r = await fetch(api + path, { method: body ? 'POST' : 'GET', headers, signal: AbortSignal.timeout(15000), ...(body ? {body: JSON.stringify(body)} : {}) });
      const data = await r.json();
      if (!current()) throw Error('Votre session a changé.');
      if (!r.ok) throw Error(data.error || 'Impossible de charger la commande.');
      return data;
    };
    const error = e => { if (modal.isConnected) modal.querySelector('[data-error]').textContent = e.message; };
    try {
      const catalog = await request('/dashboard/amendment-catalog');
      if (!modal.isConnected) return;
      let rows = structuredClone(order.amendment?.status === 'pending' ? order.amendment.proposal.items : order.items);
      let reason = order.amendment?.status === 'pending' ? order.amendment.proposal.reason : '';
      let preview = null;
      const editor = modal.querySelector('[data-editor]');
      const invalidate = () => { preview = null; modal.querySelector('[data-preview]').innerHTML = ''; modal.querySelector('[data-send]').hidden = true; };
      const input = () => ({ revision: order.amendment?.revision || 0, reason, items: rows.map(r => ({ productId:r.productId, quantity:r.quantity, selections:r.options.map(({groupId,id})=>({groupId,id})) })) });
      function render() {
        editor.innerHTML = `<label>Motif pour le client<textarea data-reason maxlength="300" required>${esc(reason)}</textarea></label><div data-lines>${rows.map((row,i) => {
          const definition = catalog.definitions[row.productId];
          return `<fieldset><legend>Article ${i+1}</legend><label>Produit<select data-product="${i}">${catalog.products.filter(p=>catalog.definitions[p.id]).map(p=>`<option value="${esc(p.id)}" ${p.id===row.productId?'selected':''} ${!p.available?'disabled':''}>${esc(p.name)} · ${money(p.price)}${!p.available?' · Indisponible':''}</option>`).join('')}</select></label><label>Quantité<input type="number" min="1" max="20" data-quantity="${i}" value="${row.quantity}" /></label><button type="button" data-remove="${i}">Retirer cet article</button>${definition.groups.map(group=>`<details ${['drink','duo-drink-one','duo-drink-two'].includes(group)?'open':''}><summary>${groups[group]}${catalog.rules[group]?.min?' · obligatoire':''}</summary>${catalog.choices.filter(o=>o.groupId===group && (group!=='sauces' || (definition.fixedSauce ? o.id===definition.fixedSauce : !o.id.startsWith('fixed-')))).map(o=>`<label class="amendment-choice"><input type="checkbox" data-option="${i}" data-group="${esc(group)}" value="${esc(o.id)}" ${row.options.some(x=>x.groupId===group&&x.id===o.id)?'checked':''} ${catalog.options[group+':'+o.id]===false && !row.options.some(x=>x.groupId===group&&x.id===o.id)?'disabled':''} />${esc(o.label)}${o.price?' + '+money(o.price):''}${catalog.options[group+':'+o.id]===false?' · indisponible':''}</label>`).join('')}</details>`).join('')}</fieldset>`;
        }).join('')}</div><button type="button" data-add>Ajouter un article</button><p>Montant déjà payé : <strong>${money(order.paidTotal ?? order.total)}</strong>. Aucun supplément ne sera débité.</p><button type="button" class="primary-button" data-check>Vérifier le nouveau panier</button><div data-preview aria-live="polite"></div><button type="button" class="primary-button" data-send hidden>Envoyer au client pour revalidation</button>`;
        editor.querySelector('[data-reason]').oninput = e => {reason=e.target.value;invalidate();};
        editor.querySelectorAll('[data-product]').forEach(el=>el.onchange=()=>{
          const row=rows[Number(el.dataset.product)], definition=catalog.definitions[el.value];
          row.productId=el.value;
          row.options=row.options.filter(o=>definition.groups.includes(o.groupId) && o.groupId!=='sauces');
          if(definition.fixedSauce) row.options.push({groupId:'sauces',id:definition.fixedSauce});
          else if(definition.groups.includes('sauces')) row.options.push({groupId:'sauces',id:'sans-sauce'});
          preview=null;render();
        });
        editor.querySelectorAll('[data-quantity]').forEach(el=>el.oninput=()=>{rows[Number(el.dataset.quantity)].quantity=Number(el.value);invalidate();});
        editor.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{rows.splice(Number(el.dataset.remove),1);preview=null;render();});
        editor.querySelectorAll('[data-option]').forEach(el=>el.onchange=()=>{
          const row=rows[Number(el.dataset.option)], group=el.dataset.group;
          const choice=catalog.choices.find(o=>o.groupId===group&&o.id===el.value);
          row.options=row.options.filter(o=>!(o.groupId===group && (o.id===el.value || (el.checked && (catalog.rules[group]?.max===1 || choice.exclusive || catalog.choices.find(c=>c.groupId===group&&c.id===o.id)?.exclusive)))));
          if(el.checked)row.options.push({groupId:group,id:el.value});
          preview=null;render();
        });
        editor.querySelector('[data-add]').onclick=()=>{if(rows.length>=20)return;rows.push({productId:'drink-coca',quantity:1,options:[]});preview=null;render();};
        editor.querySelector('[data-check]').onclick=async e=>{
          e.target.disabled=true;modal.querySelector('[data-error]').textContent='';
          const snapshot=JSON.stringify(input());
          try{
            const result=await request(`/dashboard/orders/${encodeURIComponent(order.id)}/amendment-preview`,JSON.parse(snapshot));
            if(!modal.isConnected || snapshot!==JSON.stringify(input()))return;
            preview={...result,input:JSON.parse(snapshot)};
            const p=result.proposal;
            editor.querySelector('[data-preview]').innerHTML=`<h3>Nouveau panier proposé</h3>${p.items.map(item=>`<p><strong>${item.quantity} × ${esc(item.name)} · ${money(item.price*item.quantity)}</strong><br>${item.options.map(o=>esc(o.label)).join(' · ')}</p>`).join('')}<p><strong>Nouveau total : ${money(p.total)}</strong><br>À rembourser dans SumUp après accord : <strong>${money(p.refundAmount)}</strong></p>`;
            editor.querySelector('[data-send]').hidden=false;
          }catch(e){error(e);}finally{e.target.disabled=false;}
        };
        editor.querySelector('[data-send]').onclick=async e=>{
          if(!preview)return;e.target.disabled=true;
          try{
            const result=await request(`/dashboard/orders/${encodeURIComponent(order.id)}/amendment`,{...preview.input,previewFingerprint:preview.fingerprint});
            if(!modal.isConnected)return;
            editor.innerHTML=`<h3>Proposition enregistrée</h3><p>En attente de l’accord du client jusqu’à ${new Date(result.order.amendment.expiresAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}.</p><p>${result.order.amendment.notification.devices?'Notification mobile mise en file d’envoi et demande visible dans Mes commandes.':'Demande visible dans Mes commandes. Aucune notification mobile disponible pour ce client : prévenez-le par téléphone pour qu’il ouvre son suivi.'}</p><button type="button" data-done>Fermer</button>`;
            editor.querySelector('[data-done]').onclick=clear;await refresh();
          }catch(err){error(err);e.target.disabled=false;}
        };
      }
      render();
    }catch(e){error(e);}
  }
  return {open,clear};
})();
