const { DEFAULT_NEWS, safePublicUrl } = require('../news-config');
const { publicContest } = require('./referral-contest');
const { parisDateKey, regularSlotsForDate, scheduleOverride } = require('./availability');
const { promotionNews } = require('./promotion-news');
const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const dashboardNews = database => database.news || { revision: 0, items: DEFAULT_NEWS.map(item => ({ ...item })) };
const closedTonight = (database, now) => {
  const date = parisDateKey(now);
  return ['pickup', 'delivery', 'reservation'].every(method => {
    const slots = regularSlotsForDate(date, method).filter(slot => slot >= '18:00');
    return slots.length > 0 && slots.every(slot => scheduleOverride(database, date, slot, method) === false);
  });
};
const publicNews = (database, now = new Date(), modernContestClient = true) => {
  const contest = modernContestClient ? publicContest(database, now) : { status: 'inactive' };
  const items = dashboardNews(database).items.filter(item => item.enabled && item.kind !== 'product').map(item => {
    if (item.kind !== 'contest' || contest.status === 'inactive') return item;
    if (contest.status === 'scheduled') return { ...item, title: 'Le concours Bibou arrive', subtitle: `Ouverture le ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(new Date(`${contest.startDate}T12:00:00Z`))} · 3 gagnants · participation gratuite` };
    if (contest.status === 'closed') return { ...item, title: 'Le concours Bibou est terminé', subtitle: 'Le classement final est en cours de vérification.' };
    return { ...item, title: 'Le concours Bibou est ouvert', subtitle: '24 menus pour la 1re place · 20 points par ami inscrit · 1 point par partage du jour · 1 point par € payé · sans achat obligatoire' };
  });
  if (!closedTonight(database, now)) return { items: promotionNews(database, now, items) };
  const dateLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(now);
  return { items: [{ id: 'contest', kind: 'note', enabled: true, title: 'Fermé exceptionnellement ce soir',
    subtitle: `Ce ${dateLabel} : pas de click & collect, de livraison ni de réservation de table. La carte reste consultable.`, url: '', imageUrl: '' },
    ...items.filter(item => item.id !== 'contest')] };
};
function saveNews(database, input, now = new Date()) {
  if (!input || input.revision !== dashboardNews(database).revision) throw error('Les actualités ont changé. Actualisez avant de réessayer.', 409);
  if (!Array.isArray(input.items) || input.items.length > 8) throw error('Le carrousel peut contenir au maximum 8 actualités.');
  const ids = new Set();
  const items = input.items.map(item => {
    if (!item || !/^[a-z0-9-]{1,50}$/.test(item.id) || ids.has(item.id)) throw error('Identifiant de carte invalide ou répété.');
    ids.add(item.id);
    if (!['video','social','contest','article','note'].includes(item.kind) || typeof item.enabled !== 'boolean') throw error('Type de carte invalide.');
    const result = { id: item.id, kind: item.kind, enabled: item.enabled };
    for (const [field, max] of Object.entries({ title: 70, subtitle: 160, url: 1500, imageUrl: 1500, productId: 80 })) {
      if (item[field] !== undefined && (typeof item[field] !== 'string' || item[field].length > max)) throw error(`Champ invalide : ${field}.`);
      result[field] = (item[field] || '').trim();
    }
    if (!result.title) throw error('Chaque actualité doit avoir un titre.');
    if ([result.url, result.imageUrl].some(value => value && !safePublicUrl(value))) throw error('Utilisez des liens HTTPS publics, sans identifiants.');
    if (['article','video'].includes(result.kind) && !result.url) throw error('Un article ou une vidéo doit avoir un lien.');
    if (['social','contest'].includes(result.kind)) { result.url = ''; result.imageUrl = ''; }
    return result;
  });
  database.news = { revision: input.revision + 1, updatedAt: now.toISOString(), items };
  return database.news;
}
module.exports = { dashboardNews, publicNews, saveNews };
