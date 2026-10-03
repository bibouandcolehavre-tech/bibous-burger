/* The restaurant editor prepares the draft; publication requires a separate confirmed action. */
window.BibouMarketing = function ({ root, api, token, onUnauthorized }) {
  let news = null, contest = null, dirtyNews = false, dirtyContest = false, busy = false, epoch = 0;
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  root.innerHTML = `<div class="marketing-intro"><p class="eyebrow">LA VIE DE BIBOU</p><h2>Vos actualités, à votre rythme.</h2><p>Modifiez le carrousel de l’accueil sans refaire l’application. Le concours reste un brouillon privé : cette page ne permet pas de le lancer.</p></div>
    <p id="marketing-feedback" role="status" aria-live="polite"></p>
    <section class="marketing-panel"><h2>Le carrousel « Nos actualités »</h2><p>Les cartes visibles sont publiées avec le bouton Enregistrer les actualités. Mise à jour à l’ouverture de l’accueil, puis sous une minute. Les liens des réseaux sociaux restent ceux de vos comptes officiels.</p><div id="news-cards"></div><div class="marketing-actions"><button type="button" id="news-add" class="secondary-button">+ Ajouter une actualité</button><button type="button" id="news-save" class="login-button">Enregistrer les actualités</button></div></section>
    <section class="marketing-panel"><p id="contest-badge" class="marketing-badge">BROUILLON · NON LANCÉ</p><h2>Préparer le concours</h2><p>Barème validé, sans tirage au sort : 20 points par nouvel ami inscrit et vérifié par SMS, 1 point par jour pour l’appui sur Partager, plus 1 point par euro de commandes payées. L’application ne peut pas prouver une publication sur un réseau social. On peut participer et gagner sans achat en invitant des amis. Aucun plafond de points. Les points fidélité habituels restent séparés. Dates retenues : du 5 au 31 octobre 2026 inclus, heure de Paris.</p><form id="contest-form"><div class="marketing-grid">${[['title','Titre',120],['region','Zone de participation',160],['startDate','Date de début (heure de Paris)',10],['endDate','Date de fin incluse (heure de Paris)',10],['firstPrize','Lot de la 1re place',400],['secondPrize','Lot de la 2e place',400],['thirdPrize','Lot de la 3e place',400]].map(([name,label,max]) => `<label>${label}<input name="${name}" type="${name.endsWith('Date') ? 'date' : 'text'}" maxlength="${max}" /></label>`).join('')}</div><label>Règlement complet<textarea name="rules" rows="9" maxlength="12000" placeholder="À finaliser avant lancement : organisateur, dates, majorité, zone, barème, lots, départage des ex æquo, remise des lots, protection des données…"></textarea></label><p>La mécanique technique prévoit une participation par numéro, une majorité déclarée et une résidence dans la zone déclarée. Aucun avis Google ni abonnement publicitaire n’est demandé. Définissez aussi les recours et les contrôles anti-abus dans le règlement.</p><button class="login-button" type="submit">Enregistrer le brouillon</button></form>
    <div id="contest-readiness"></div><h3>Aperçu de la carte</h3><div id="contest-preview" class="marketing-preview"></div><h3>Suivi du concours</h3><div id="contest-statistics"></div><div id="contest-ranking"></div><p>Les nombres affichés sont des inscriptions participantes, pas des téléchargements mesurés par Apple ou Google. Aucun gagnant n’est automatiquement désigné ; les ex æquo sont signalés.</p></section>
    <button type="button" id="marketing-reset" class="secondary-button">Recharger la version enregistrée</button>`;
  const q = selector => root.querySelector(selector);
  const message = text => { q('#marketing-feedback').textContent = text; };
  const freeze = value => { busy = value; root.querySelectorAll('button,input,textarea,select').forEach(el => { el.disabled = value || (!!contest && contest.draft.status !== 'draft' && !!el.closest('#contest-form')); }); };
  const request = async (path, body) => {
    const current = token(), controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(api + path, { method: body ? 'PATCH' : 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${current}`, 'Content-Type': 'application/json' }, signal: controller.signal, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (current !== token()) throw new Error('Session modifiée.');
      if (response.status === 401) { onUnauthorized(); throw new Error('Reconnectez-vous.'); }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Enregistrement impossible.');
      return data;
    } finally { clearTimeout(timeout); }
  };
  function renderNews() {
    q('#news-cards').innerHTML = news.items.map((item,index) => `<article class="news-editor" data-index="${index}"><div class="marketing-actions"><strong>Carte ${index+1}</strong><label class="inline-check"><input type="checkbox" data-field="enabled" ${item.enabled ? 'checked' : ''} /> Visible</label><button type="button" data-action="up" aria-label="Monter la carte ${index+1}">↑</button><button type="button" data-action="down" aria-label="Descendre la carte ${index+1}">↓</button><button type="button" data-action="remove">Retirer</button></div><div class="marketing-grid"><label>Type<select data-field="kind">${[['video','Vidéo'],['social','Réseaux sociaux'],['contest','Concours'],['article','Article de presse'],['note','Autre actualité']].map(([v,l]) => `<option value="${v}" ${item.kind===v?'selected':''}>${l}</option>`).join('')}</select></label>${item.kind !== 'social' ? `<label>Titre<input data-field="title" maxlength="70" value="${e(item.title)}" /></label><label>Sous-titre<input data-field="subtitle" maxlength="160" value="${e(item.subtitle)}" /></label>` : '<p>Instagram, Facebook et TikTok : trois logos cliquables.</p>'}${['article','video','note'].includes(item.kind) ? `<label>Lien HTTPS<input type="url" data-field="url" value="${e(item.url)}" maxlength="1500" /></label><label>Photo (lien HTTPS, facultatif)<input type="url" data-field="imageUrl" value="${e(item.imageUrl)}" maxlength="1500" /></label>` : ''}</div></article>`).join('') || '<p>Aucune carte : le carrousel sera masqué.</p>';
  }
  const draftFields = ['title','region','startDate','endDate','firstPrize','secondPrize','thirdPrize','rules'];
  const collectDraft = () => Object.fromEntries(draftFields.map(name => [name, q(`#contest-form [name="${name}"]`).value]));
  const preview = () => {
    const fields = collectDraft();
    q('#contest-preview').innerHTML = `<small>APERÇU PRIVÉ</small><h3>${e(fields.title || 'Les ambassadeurs Bibou')}</h3><p>${e(fields.startDate || 'Début à définir')} → ${e(fields.endDate || 'Fin à définir')}</p><p>1re place : ${e(fields.firstPrize || 'lot à confirmer')}</p><p>2e place : ${e(fields.secondPrize || 'lot à confirmer')}</p><p>3e place : ${e(fields.thirdPrize || 'lot à confirmer')}</p><p>20 points par nouvel inscrit vérifié + 1 point par jour de partage dans l’app + 1 point par euro payé, sans achat obligatoire ni tirage au sort.</p>`;
  };
  function renderContest() {
    for (const name of draftFields) q(`#contest-form [name="${name}"]`).value = contest.draft[name] || '';
    q('#contest-badge').textContent = contest.draft.status === 'draft' ? 'BROUILLON · NON LANCÉ' : `CONCOURS PUBLIÉ · ${contest.status === 'scheduled' ? 'OUVERTURE À VENIR' : contest.status === 'active' ? 'EN COURS' : 'TERMINÉ'}`;
    q('#contest-readiness').innerHTML = contest.draft.status === 'draft' ? '<h3>Avant le lancement</h3>' + (contest.missing.length ? `<ul>${contest.missing.map(value => `<li>${e(value)}</li>`).join('')}</ul>` : '<p>Champs renseignés. La validation du règlement, des lots et du lancement reste nécessaire.</p>') + '<p><strong>Lancement verrouillé.</strong> Enregistrer ce brouillon ne publie pas le règlement ni les lots aux clients.</p>' : '<p>Le règlement est publié. Les dates contrôlent automatiquement l’ouverture et la clôture.</p>';
    const stats = contest.statistics;
    q('#contest-statistics').innerHTML = `<div class="marketing-stats"><p><strong>${stats.participants}</strong> participants</p><p><strong>${stats.newReferrals}</strong> nouveaux inscrits parrainés</p><p><strong>${stats.paidCustomers}</strong> participants ayant commandé</p><p><strong>${stats.paidOrders}</strong> commandes payées des participants</p><p><strong>${new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(stats.paidRevenue)}</strong> encaissés sur ces commandes</p></div>`;
    q('#contest-ranking').innerHTML = contest.ranking.length ? `<ol>${contest.ranking.map(row => `<li>${row.rank}. ${e(row.alias)} — ${row.score} points (${row.referrals} filleul(s), ${row.sharePoints || 0} de partage, ${row.purchasePoints} de commandes) ${row.tied?'· ex æquo':''}</li>`).join('')}</ol><p>${contest.rankingTotal} participants au total ; 100 premiers affichés. Aucun gagnant n’est désigné automatiquement.</p>` : '<p>Le classement apparaîtra après le lancement et les premières participations.</p>';
    preview();
  }
  async function load(force = false) {
    if (busy || !token()) return;
    if ((dirtyNews || dirtyContest) && !force) { message('Vos modifications non enregistrées sont conservées. Enregistrez-les ou rechargez la version enregistrée.'); return; }
    const id = ++epoch; freeze(true); message('Chargement…');
    try {
      const [n,c] = await Promise.all([request('/dashboard/news'), request('/dashboard/contest')]);
      if (id !== epoch) return;
      news=n; contest=c; dirtyNews=dirtyContest=false; renderNews(); renderContest(); message(contest.draft.status === 'draft' ? 'Actualités chargées. Le concours n’est pas lancé.' : 'Actualités et concours chargés.');
    } catch (err) { if (id === epoch) message(err.name === 'AbortError' ? 'Connexion trop lente. Réessayez.' : err.message); }
    finally { if (id === epoch) freeze(false); }
  }
  q('#news-cards').addEventListener('input', event => {
    const field=event.target.dataset.field, card=event.target.closest('[data-index]');
    if (!field || !card || busy) return;
    news.items[Number(card.dataset.index)][field] = field==='enabled' ? event.target.checked : event.target.value;
    dirtyNews=true;
  });
  q('#news-cards').addEventListener('change', event => {
    if (event.target.dataset.field !== 'kind') return;
    const item=news.items[Number(event.target.closest('[data-index]').dataset.index)];
    if (item.kind==='social') item.title='Suivez-nous'; renderNews();
  });
  q('#news-cards').addEventListener('click', event => {
    const action=event.target.dataset.action, card=event.target.closest('[data-index]'); if (!action || !card || busy) return;
    const i=Number(card.dataset.index), j=action==='up'?i-1:i+1;
    if (action==='remove') news.items.splice(i,1);
    else if(j>=0 && j<news.items.length) [news.items[i],news.items[j]]=[news.items[j],news.items[i]];
    dirtyNews=true; renderNews();
  });
  q('#news-add').onclick = () => { if (!news || busy) return; if(news.items.length>=8)return message('Maximum : 8 cartes.'); news.items.push({id:'news-'+Date.now(),kind:'note',title:'Nouvelle actualité',subtitle:'',enabled:false});dirtyNews=true;renderNews(); };
  q('#contest-form').addEventListener('input',()=>{dirtyContest=true;preview();});
  async function save(kind) {
    if (busy || !news || !contest) return;
    if (kind === 'contest' && contest.draft.status !== 'draft') return message('Le règlement publié ne peut plus être modifié.');
    const id=epoch; freeze(true); message('Enregistrement…');
    try {
      const body=kind==='news'?news:{revision:contest.draft.revision,...collectDraft()};
      const result=await request('/dashboard/'+kind,body);
      if(id!==epoch)return;
      if(kind==='news'){news=result;dirtyNews=false;renderNews();message('Actualités enregistrées : elles apparaîtront dans l’accueil sous une minute.');}
      else {contest=result;dirtyContest=false;renderContest();message('Brouillon enregistré. Le concours reste non lancé.');}
    }catch(err){if(id===epoch)message(err.name==='AbortError'?'Réponse trop lente : rechargez pour vérifier l’enregistrement.':err.message);}
    finally{if(id===epoch)freeze(false);}
  }
  q('#news-save').onclick=()=>void save('news');
  q('#contest-form').onsubmit=event=>{event.preventDefault();void save('contest');};
  q('#marketing-reset').onclick=()=>{if(!(dirtyNews||dirtyContest)||window.confirm('Abandonner vos modifications non enregistrées ?'))void load(true);};
  return {load, clear(){epoch++;news=contest=null;dirtyNews=dirtyContest=false;busy=false;q('#news-cards').innerHTML='';q('#contest-form').reset();q('#contest-ranking').innerHTML='';q('#contest-statistics').innerHTML='';q('#contest-readiness').innerHTML='';q('#contest-preview').innerHTML='';message('');freeze(false);}};
};
