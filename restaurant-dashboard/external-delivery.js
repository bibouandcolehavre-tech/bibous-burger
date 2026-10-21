window.KrokliExternalDelivery = (() => {
  'use strict';
  const money=cents=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(cents/100);
  function create({root,request,onCreated=()=>{}}) {
    root.innerHTML=`<section class="workspace-panel external-launch"><div><p class="eyebrow">UBER · VOS PROPRES LIVREURS</p><h2>Ajouter une livraison</h2><p>Prénom, adresse et téléphone : les frais du livreur sont calculés avec votre barème.</p></div><button type="button" class="primary-button" data-external-open aria-expanded="false" aria-controls="external-delivery-form">Ajouter une livraison Uber</button></section>
      <section class="external-dialog" id="external-delivery-form" role="region" aria-labelledby="external-title" hidden><form autocomplete="off">
      <div class="external-dialog-head"><div><p class="eyebrow">KROKLI PRO · LIVRAISON UBER</p><h2 id="external-title">Une course en trois champs</h2></div><button type="button" data-external-close aria-label="Fermer">✕</button></div>
      <p>Pour les commandes Uber livrées par vos propres livreurs, pas par un livreur Uber.</p>
      <div class="external-fields simple"><label>Prénom du client<input name="customerName" required minlength="2" maxlength="80" placeholder="Prénom"></label>
      <label>Adresse complète<input name="fullAddress" required maxlength="280" placeholder="12 rue Exemple, 76600 Le Havre"></label>
      <label>Téléphone ou numéro relais Uber<input name="phone" type="tel" required maxlength="24" placeholder="06 00 00 00 00"></label></div>
      <details class="external-optional"><summary>Ajouter une référence ou une instruction · facultatif</summary><div class="external-fields"><label>Référence Uber<input name="reference" maxlength="40" placeholder="Ex. ABC12"></label><label>Code téléphonique Uber<input name="phoneExtension" inputmode="numeric" maxlength="10" placeholder="Si affiché avec le numéro relais"></label><label class="wide">Instructions pour le livreur<textarea name="notes" maxlength="400" placeholder="Étage, interphone, indications…"></textarea></label></div></details>
      <section class="external-price"><p data-external-price>Frais calculés automatiquement à la validation.</p><small>Depuis le restaurant, par la route : jusqu’à 1,5 km → 3,99 € ; 3 km → 4,99 € ; 5 km → 5,99 € ; 7 km → 6,99 €. Au-delà, ou si le trajet est introuvable, la création est bloquée.</small></section>
      <p class="external-status" role="status" aria-live="polite"></p>
      <p class="external-payment-note">Paiement client dans Uber : rien à encaisser à nouveau. Seuls les frais du livreur seront comptés après livraison. La course ne crée pas de vente Bibou et ne met pas Uber à jour.</p>
      <div class="external-dialog-actions"><button type="button" data-external-close>Annuler</button><button type="submit" class="primary-button">Valider et créer la course</button></div>
      </form></section>`;
    const dialog=root.querySelector('#external-delivery-form'),opener=root.querySelector('[data-external-open]'),form=root.querySelector('form'),status=root.querySelector('.external-status'),price=root.querySelector('[data-external-price]');
    let generation=0,busy=false,quote=null,retainedInput=null;
    const value=name=>form.elements.namedItem(name).value.trim();
    const say=text=>{status.textContent=text;};
    function lock(value){busy=value;for(const item of form.elements)item.disabled=value;}
    function clear(){generation++;form.reset();say('');quote=null;retainedInput=null;price.textContent='Frais calculés automatiquement à la validation.';lock(false);dialog.hidden=true;opener.setAttribute('aria-expanded','false');}
    opener.addEventListener('click',()=>{if(busy)return;if(dialog.hidden)clear();dialog.hidden=false;opener.setAttribute('aria-expanded','true');dialog.scrollIntoView({block:'start',behavior:'instant'});form.elements.namedItem('customerName').focus({preventScroll:true});});
    root.querySelectorAll('[data-external-close]').forEach(button=>button.addEventListener('click',()=>{if(!busy){clear();opener.focus({preventScroll:true});}}));
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'&&!busy){event.preventDefault();clear();opener.focus({preventScroll:true});}});
    form.addEventListener('input',()=>{if(busy)return;retainedInput=null;quote=null;price.textContent='Frais calculés automatiquement à la validation.';});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy||!form.reportValidity())return;
      const address=window.KrokliDeliveryParser.destination(value('fullAddress'));
      if(!address)return say('Complétez l’adresse avec le code postal et la ville, par exemple : 12 rue Exemple, 76600 Le Havre.');
      const phone=value('phone').replace(/[ .\-]/g,'');
      if(!/^(?:\+\d{8,15}|0\d{9})$/.test(phone))return say('Vérifiez le numéro de téléphone. Le code téléphonique Uber se renseigne dans les options.');
      const fields={...address,customerName:value('customerName'),phone,reference:value('reference'),phoneExtension:value('phoneExtension'),notes:value('notes')};
      const current=generation;lock(true);
      try{
        if(!retainedInput){
          say('Calcul du trajet et des frais du livreur…');
          const result=await request('/external-deliveries/quote','POST',address);if(current!==generation)return;
          if(typeof result.quoteToken!=='string'||!Number.isSafeInteger(result.driverPayCents)||!Number.isFinite(result.distanceKm))throw Error('Le calcul est incomplet. Aucune course créée.');
          quote=result;price.textContent=`${result.distanceKm.toLocaleString('fr-FR')} km par la route · ${money(result.driverPayCents)} pour le livreur`;
          retainedInput={requestId:crypto.randomUUID(),...fields,quoteToken:result.quoteToken,confirmed:true,ownCourierConfirmed:true};
        }
        say('Création de la course, sans nouvel encaissement…');
        const result=await request('/external-deliveries','POST',retainedInput);if(current!==generation)return;
        clear();await onCreated(result.delivery);
      }catch(error){if(current===generation){if(error.status===409&&/calcul expiré|Adresse modifiée/.test(error.message))retainedInput=null;say(`${error.message} En cas de coupure, réessayez sans modifier les champs pour éviter un doublon.`);}}
      finally{if(current===generation)lock(false);}
    });
    return {clear};
  }
  return {create};
})();
