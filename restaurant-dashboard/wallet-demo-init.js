(function(){
 'use strict';
 if(!window.BibouWalletScanner||!document.getElementById('wallet-scanner'))return;
 window.BibouWalletScanner.create({
  dialog:document.getElementById('wallet-scanner'),button:document.getElementById('wallet-scan-open'),
  api:window.location.origin+'/api',token:()=>typeof dashboardToken==='string'?dashboardToken:'',
  onUnauthorized:()=>{if(typeof showLogin==='function')showLogin('Connectez-vous au restaurant de vérification.');},
  onCustomer:id=>{if(id==='pro-review-camille'&&typeof loadCustomerDetail==='function')void loadCustomerDetail(id,true);}
 });
})();
