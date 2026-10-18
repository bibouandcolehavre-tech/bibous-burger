'use strict';
function fixture(now=new Date()){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(now);
 const customer={id:'pro-review-camille',name:'Camille · exemple',firstName:'Camille',lastName:'Exemple',phone:'+33600000000',createdAt:'2025-01-01T10:00:00Z',points:20,crmPreferences:{birthday:date.slice(5),personalizedOffers:true},pushPreferences:{marketing:false,service:false}};
 const make=(number,status,slot)=>({id:'pro-review-order-'+number,number,customerId:customer.id,customerName:customer.name,method:'pickup',serviceDate:date,slot,createdAt:now.toISOString(),status,payment:{status:'PAID',paidAt:now.toISOString(),provider:'example'},subtotal:12,total:12,deliveryFee:0,reviewMode:true,comment:'Exemple de vérification : aucun repas ni paiement réel.',items:[{productId:'review-only',name:'Burger de démonstration',price:12,quantity:1,options:[{label:'Sans cornichons',price:0}]}]});
 return {customers:[customer],orders:[make(9001,'confirmed','19:20'),make(9002,'preparing','19:40'),make(9003,'ready','20:00')],reservations:[],nextCustomerId:2,nextOrderNumber:9004};
}
module.exports={fixture};
