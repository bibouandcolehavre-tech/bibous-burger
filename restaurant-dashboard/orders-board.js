/* Reorganise existing order elements only. Existing actions and handlers survive. */
window.KrokliOrdersBoard={mount({root,orders,today}){
  if(!root||!orders.length)return;
  const nodes=new Map([...root.querySelectorAll('[data-service-order]')].map(n=>[n.dataset.serviceOrder,n]));
  if(!nodes.size)return;
  const groups=[['Nouvelles','new'],['En préparation','preparing'],['Prêtes','ready'],['Livraisons en cours','out'],['À vérifier','check']];
  const buckets=Object.fromEntries(groups.map(([,key])=>[key,[]]));
  for(const order of orders){const node=nodes.get(order.apiId);if(!node)continue;const check=window.KrokliServiceOrders?.group(order,today)==='check';const key=check?'check':({'Nouvelle':'new','Acceptée':'preparing','Prête':'ready','En livraison':'out'})[order.status]||'check';buckets[key].push(node);}
  root.replaceChildren();root.classList.add('orders-board');
  for(const [label,key] of groups){if(!buckets[key].length&&!['preparing','ready'].includes(key))continue;const section=document.createElement('section');section.className='orders-board-column orders-board-'+key;section.setAttribute('aria-label',label);const heading=document.createElement('h2');heading.textContent=label+' · '+buckets[key].length;section.append(heading);if(buckets[key].length)section.append(...buckets[key]);else{const empty=document.createElement('p');empty.className='orders-board-empty';empty.textContent='Aucune commande';section.append(empty);}root.append(section);}
}};
