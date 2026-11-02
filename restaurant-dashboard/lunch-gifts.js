(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BibouLunchGifts=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const choices=[['frites-maison','Frites maison'],['tenders-xl-3','3 tenders XL'],['drink-coca','Coca 33 cl'],['drink-coca-cherry','Coca Cherry 33 cl'],['drink-fuse-menthe','Fuse Tea menthe'],['drink-lipton-framboise','Lipton framboise'],['drink-lipton-peche','Lipton pêche'],['drink-oasis-pomme','Oasis pomme'],['drink-oasis-tropical','Oasis tropical'],['drink-perrier','Perrier'],['drink-tropico','Tropico']];
  function markup(order){
    const g=order?.lunchGift;
    if(g?.campaignId!=='first-five-lunch-20261103'||order.status==='cancelled'||!['attached','choice_required'].includes(g.status))return '';
    return `<aside class="lunch-gift" data-lunch-gift="${esc(order.id)}" style="border:2px solid #315e4c;background:#edf3df;color:#214e3e;border-radius:15px;padding:14px;margin:12px 0"><strong>🎁 CADEAU MIDI · ${esc(g.rank)}/5 · OFFERT</strong><p style="margin:8px 0;font-weight:700">1 × ${esc(g.label)}</p><small>À ajouter à cette commande. Points fidélité, classement et tours de roue habituels conservés.</small>${g.status==='choice_required'?`<p><label>Cadeau convenu avec le client<select data-lunch-gift-choice>${choices.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label><button type="button" data-lunch-gift-assign style="background:#315e4c;color:white;border:0;border-radius:12px;padding:12px;margin-top:10px">Ajouter ce cadeau à la commande</button></p><p role="status" data-lunch-gift-feedback></p>`:''}</aside>`;
  }
  function create({api,token,refresh,onUnauthorized}){
    const busy=new Set();
    const handle=async event=>{
      const button=event.target.closest?.('[data-lunch-gift-assign]');if(!button)return;
      const box=button.closest('[data-lunch-gift]'),id=box?.dataset.lunchGift,savedToken=token();
      if(!id||!savedToken||busy.has(id))return;
      busy.add(id);button.disabled=true;
      try{const response=await fetch(api+'/dashboard/orders/'+encodeURIComponent(id)+'/lunch-gift',{method:'PATCH',headers:{Authorization:'Bearer '+savedToken,'Content-Type':'application/json'},body:JSON.stringify({productId:box.querySelector('[data-lunch-gift-choice]').value}),signal:AbortSignal.timeout(15000)});
        const data=await response.json();if(savedToken!==token())return;if(response.status===401){onUnauthorized();return;}if(!response.ok)throw Error(data.error||'Cadeau non ajouté. Rechargez la commande.');await refresh();
      }catch(error){if(savedToken===token()&&box.isConnected)box.querySelector('[data-lunch-gift-feedback]').textContent=error.message;}
      finally{busy.delete(id);if(button.isConnected)button.disabled=false;}
    };
    document.addEventListener('click',handle);return{destroy:()=>document.removeEventListener('click',handle)};
  }
  return{markup,create};
});
