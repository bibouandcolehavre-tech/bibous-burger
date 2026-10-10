const test=require('node:test'),assert=require('node:assert/strict');
const printer=require('../restaurant-dashboard/epson-print');
test('ticket borne immédiate : mode visible, aucune réservation de table ni heure future inventée',()=>{
  const base={id:'fictional',number:42,kioskImmediate:true,method:'pickup',payment:{status:'PAID'},items:[{name:'Classique',quantity:1,price:9.9}],total:9.9,slot:'21:17',serviceDate:'2026-10-10'};
  for(const mode of ['here','take']) {
    const order={...base,kioskDiningMode:mode,dineIn:mode==='here'};
    for(const render of [printer.preparationEnvelope,printer.orderReceiptEnvelope]) {
      const xml=render(order);
      assert.match(xml,mode==='here'?/SUR PLACE/:/A EMPORTER/);assert.match(xml,/COMMANDE BORNE/);
      assert.doesNotMatch(xml,/ARRIVEE|TABLE DE|POUR LE|CRENEAU|21:17/);
    }
  }
});
