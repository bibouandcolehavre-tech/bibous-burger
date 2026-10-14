/* The restaurant editor prepares the draft; publication requires a separate confirmed action. */
window.BibouMarketing = function ({ root, api, token, onUnauthorized }) {
  let news = null, contest = null, dirtyNews = false, dirtyContest = false, busy = false, epoch = 0;
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  root.innerHTML = `<div class="marketing-intro"><p class="eyebrow">LA VIE DE BIBOU</p><h2>Vos actualités, à votre rythme.</h2><p>Modifiez les cartes des actualités sans refaire l’application. Le concours reste privé jusqu’à sa publication explicitement confirmée ci-dessous.</p></div>
    <p id="marketing-feedback" role="status" aria-live="polite"></p>
    <section class="marketing-panel"><h2>Le carrousel « Nos actualités »</h2><p>Les cartes visibles sont publiées avec le bouton Enregistrer les actualités. Mise à jour à l’ouverture de l’accueil, puis sous une minute. Les liens des réseaux sociaux restent ceux de vos comptes officiels.</p><div id="news-cards"></div><div class="marketing-actions"><button type="button" id="news-add" class="secondary-button">+ Ajouter une actualité</button><button type="button" id="news-save" class="login-button">Enregistrer les actualités</button></div></section>
    <section class="marketing-panel"><p id="contest-badge" class="marketing-badge">BROUILLON · NON LANCÉ</p><h2>Préparer le concours commun</h2>
    <p>Un seul classement iPhone, Android et web : 20 points par nouvel ami inscrit et vérifié par SMS, 1 point par jour pour l’appui sur Partager, plus 1 point par euro de commandes payées. L’application ne prouve pas un partage réel. Les points fidélité et gains de roue restent séparés. Les trois lots du classement ne sont pas tirés au sort. Les tirages bonus de quinzaine sont réalisés à l’extérieur, sur la liste commune, selon le règlement. Enregistrer le brouillon ne lance pas le concours.</p>
    <form id="contest-form"><div class="marketing-grid">${[['title','Titre',120],['region','Zone de participation',160],['startDate','Date de début (heure de Paris)',10],['startTime','Heure de début (heure de Paris)',5],['endDate','Date de fin incluse (heure de Paris)',10],['firstPrize','Lot de la 1re place',400],['secondPrize','Lot de la 2e place',400],['thirdPrize','Lot de la 3e place',400]].map(([name,label,max]) => `<label>${label}<input name="${name}" type="${name.endsWith('Date') ? 'date' : name === 'startTime' ? 'time' : 'text'}" maxlength="${max}" /></label>`).join('')}</div>
    <label>Règlement complet<textarea name="rules" rows="9" maxlength="12000" placeholder="À finaliser avant lancement : organisateur, dates et heure, majorité, zone, barème, lots, tirages bonus, départage, remise des lots, protection des données…"></textarea></label><p>Une participation par numéro vérifié ; majorité et résidence déclarées. Aucun achat, avis Google ni abonnement publicitaire obligatoire. Le règlement doit décrire les contrôles anti-abus et la remise des lots.</p><button class="login-button" type="submit">Enregistrer le brouillon</button></form>
    <div id="contest-readiness"></div><div class="marketing-actions"><button type="button" id="contest-prepare" class="secondary-button">Préparer le 15 octobre à 11 h · sans publier</button><button type="button" id="contest-publish" class="login-button" disabled>Publier le règlement et programmer l’ouverture</button></div><p>La préparation remplit seulement le formulaire. Enregistrez le brouillon, relisez-le, puis confirmez séparément sa publication. Cette action ne choisit aucun gagnant et n’envoie aucune notification.</p><h3>Aperçu de la carte</h3><div id="contest-preview" class="marketing-preview"></div><h3>Suivi du concours</h3><div id="contest-statistics"></div><div id="contest-ranking"></div><p>Les nombres affichés sont des inscriptions participantes, pas des téléchargements mesurés par Apple ou Google. Aucun gagnant n’est automatiquement désigné ; les ex æquo sont signalés.</p></section>
    <div id="contest-periods-root"></div><div id="contest-prizes-root"></div><button type="button" id="marketing-reset" class="secondary-button">Recharger la version enregistrée</button>`;
  const q = selector => root.querySelector(selector);
  const prizePanel = window.BibouContestPrizes?.({ root: q('#contest-prizes-root'), api, token, onUnauthorized });
  const periodPanel = window.BibouContestPeriods?.({ root: q('#contest-periods-root'), api, token, onUnauthorized });
  const message = text => { q('#marketing-feedback').textContent = text; };
  const freeze = value => { busy = value; root.querySelectorAll('button,input,textarea,select').forEach(el => { if (!el.closest('#contest-periods-root')) el.disabled = value || (!!contest && contest.draft.status !== 'draft' && (!!el.closest('#contest-form') || ['contest-prepare','contest-publish'].includes(el.id))); }); q('#contest-publish').disabled = value || !contest || contest.draft.status !== 'draft' || dirtyContest || dirtyNews || contest.missing.length > 0 || !news?.items.some(item => item.kind === 'contest' && item.enabled); };
  const request = async (path, body, method = body ? 'PATCH' : 'GET') => {
    const current = token(), controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(api + path, { method, cache: 'no-store', headers: { Authorization: `Bearer ${current}`, 'Content-Type': 'application/json' }, signal: controller.signal, ...(body ? { body: JSON.stringify(body) } : {}) });
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
  const draftFields = ['title','region','startDate','startTime','endDate','firstPrize','secondPrize','thirdPrize','rules'];
  const collectDraft = () => Object.fromEntries(draftFields.map(name => [name, q(`#contest-form [name="${name}"]`).value]));
  const preview = () => {
    const fields = collectDraft();
    q('#contest-preview').innerHTML = `<small>APERÇU PRIVÉ</small><h3>${e(fields.title || 'Les ambassadeurs Bibou')}</h3><p>${e(fields.startDate || 'Début à définir')} à ${e(fields.startTime || '00:00')} → ${e(fields.endDate || 'Fin à définir')} inclus · Paris</p><p>1re place : ${e(fields.firstPrize || 'lot à confirmer')}</p><p>2e place : ${e(fields.secondPrize || 'lot à confirmer')}</p><p>3e place : ${e(fields.thirdPrize || 'lot à confirmer')}</p><p>20 points par nouvel inscrit vérifié + 1 point par jour de partage + 1 point par euro payé. Classement sans tirage au sort ; tirages bonus séparés selon le règlement. Roue et fidélité hors classement.</p>`;
  };
  function renderContest() {
    for (const name of draftFields) q(`#contest-form [name="${name}"]`).value = contest.draft[name] || (name === 'startTime' ? '00:00' : '');
    q('#contest-badge').textContent = contest.draft.status === 'draft' ? 'BROUILLON · NON LANCÉ' : `CONCOURS PUBLIÉ · ${contest.status === 'scheduled' ? 'OUVERTURE À VENIR' : contest.status === 'active' ? 'EN COURS' : 'TERMINÉ'}`;
    q('#contest-readiness').innerHTML = contest.draft.status === 'draft' ? '<h3>Avant le lancement</h3>' + (contest.missing.length ? `<ul>${contest.missing.map(value => `<li>${e(value)}</li>`).join('')}</ul>` : '<p>Champs renseignés. Relisez le règlement et les lots avant de confirmer leur publication.</p>') + '<p><strong>Brouillon privé.</strong> Enregistrer ce brouillon ne publie pas le règlement ni les lots aux clients.</p>' : '<p>Le règlement est publié. Les dates contrôlent automatiquement l’ouverture et la clôture.</p>';
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
      news=n; contest=c; dirtyNews=dirtyContest=false; renderNews(); renderContest(); message(contest.draft.status === 'draft' ? 'Actualités chargées. Le concours n’est pas lancé.' : 'Actualités et concours chargés.'); void prizePanel?.load(); void periodPanel?.load();
    } catch (err) { if (id === epoch) message(err.name === 'AbortError' ? 'Connexion trop lente. Réessayez.' : err.message); }
    finally { if (id === epoch) freeze(false); }
  }
  q('#news-cards').addEventListener('input', event => {
    const field=event.target.dataset.field, card=event.target.closest('[data-index]');
    if (!field || !card || busy) return;
    news.items[Number(card.dataset.index)][field] = field==='enabled' ? event.target.checked : event.target.value;
    dirtyNews=true;q('#contest-publish').disabled=true;
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
  q('#contest-form').addEventListener('input',()=>{dirtyContest=true;q('#contest-publish').disabled=true;preview();});
  q('#contest-prepare').onclick = async () => {
    if (busy || !contest || contest.draft.status !== 'draft') return;
    if (dirtyContest && !window.confirm('Remplacer les modifications non enregistrées du concours par la préparation du 15 octobre à 11 h ?')) return;
    const id = epoch, session = token(), controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000); freeze(true);
    try {
      const response = await fetch('./contest-launch-20261015.json', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Préparation indisponible. Aucun champ modifié.');
      const preset = await response.json();
      if (Object.keys(preset).some(key => !draftFields.includes(key)) || draftFields.some(key => typeof preset[key] !== 'string')) throw new Error('Préparation invalide. Aucun champ modifié.');
      if (!news || (!news.items.some(item => item.kind === 'contest') && news.items.length >= 8)) throw new Error('Gardez une place pour l’annonce du concours dans les actualités avant de préparer le formulaire.');
      if (id !== epoch || !session || session !== token()) return;
      for (const name of draftFields) q(`#contest-form [name="${name}"]`).value = preset[name];
      const existing = news.items.find(item => item.kind === 'contest');
      news.items = [{ ...(existing || { id: 'contest', kind: 'contest', url: '', imageUrl: '' }), enabled: true, title: 'Concours Bibou · jusqu’au 31 décembre', subtitle: 'Ouverture le 15 octobre à 11 h · Participation gratuite · Consulte les règles et les lots.' }, ...news.items.filter(item => item.kind !== 'contest')];
      dirtyContest = dirtyNews = true; renderNews(); preview(); message('Préparation du 15 octobre à 11 h, jusqu’au 31 décembre. Rien n’est enregistré ou publié : relisez, enregistrez les actualités puis le brouillon, et confirmez séparément la programmation.');
    } catch (err) { if (id === epoch) message(err.message); }
    finally { clearTimeout(timeout); if (id === epoch) freeze(false); }
  };
  q('#contest-publish').onclick = async () => {
    if (busy || !contest || dirtyContest || dirtyNews || contest.draft.status !== 'draft' || contest.missing.length || !news?.items.some(item => item.kind === 'contest' && item.enabled)) return message('Enregistrez un brouillon complet et l’annonce visible dans les actualités, puis relisez-les avant de publier.');
    const d = contest.draft;
    if (!window.confirm(`Publier ce règlement aux clients et programmer le concours du ${d.startDate} à ${d.startTime || '00:00'} au ${d.endDate} inclus, heure de Paris ? Après confirmation, les dates contrôlent l’ouverture et ce règlement ne sera plus modifiable ici.`)) return;
    const id = epoch; freeze(true); message('Confirmation de la programmation…');
    try {
      const result = await request('/dashboard/contest/publish', { revision: d.revision, confirmation: 'PUBLIER LE CONCOURS' }, 'POST');
      if (id !== epoch) return;
      contest = result; renderContest(); message(contest.status === 'scheduled' ? 'Règlement publié. L’ouverture est programmée aux date et heure enregistrées.' : 'Règlement publié. Vérifiez l’état affiché du concours.'); void periodPanel?.load();
    } catch (err) { if (id === epoch) message(err.name === 'AbortError' ? 'Réponse trop lente : rechargez pour vérifier la programmation avant de réessayer.' : err.message); }
    finally { if (id === epoch) freeze(false); }
  };
  async function save(kind) {
    if (busy || !news || !contest) return;
    if (kind === 'contest' && contest.draft.status !== 'draft') return message('Le règlement publié ne peut plus être modifié.');
    const id=epoch; freeze(true); message('Enregistrement…');
    try {
      const body=kind==='news'?news:{revision:contest.draft.revision,...collectDraft()};
      const result=await request('/dashboard/'+kind,body);
      if(id!==epoch)return;
      if(kind==='news'){news=result;dirtyNews=false;renderNews();message('Actualités enregistrées : elles apparaîtront dans l’accueil sous une minute.');}
      else {contest=result;dirtyContest=false;renderContest();message('Brouillon enregistré. Le concours reste non lancé.'); void periodPanel?.load();}
    }catch(err){if(id===epoch)message(err.name==='AbortError'?'Réponse trop lente : rechargez pour vérifier l’enregistrement.':err.message);}
    finally{if(id===epoch)freeze(false);}
  }
  q('#news-save').onclick=()=>void save('news');
  q('#contest-form').onsubmit=event=>{event.preventDefault();void save('contest');};
  q('#marketing-reset').onclick=()=>{if(!(dirtyNews||dirtyContest)||window.confirm('Abandonner vos modifications non enregistrées ?'))void load(true);};
  return {load, clear(){epoch++;news=contest=null;dirtyNews=dirtyContest=false;busy=false;prizePanel?.clear();periodPanel?.clear();q('#news-cards').innerHTML='';q('#contest-form').reset();q('#contest-ranking').innerHTML='';q('#contest-statistics').innerHTML='';q('#contest-readiness').innerHTML='';q('#contest-preview').innerHTML='';message('');freeze(false);}};
};
