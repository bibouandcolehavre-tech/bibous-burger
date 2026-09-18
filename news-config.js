// Shared defaults keep the carousel useful during a temporary API outage.
const DEFAULT_NEWS = [
  { id: 'contest', kind: 'contest', title: 'Le concours se prépare', subtitle: 'Découvre le principe du parrainage · Ouverture à venir', enabled: true },
  { id: 'epicu', kind: 'video', title: 'Bibou vu par Epicu', subtitle: 'Le reportage du 2 mai 2026 · Voir la vidéo sur Instagram', url: 'https://www.instagram.com/epicu.lehavre.food/reel/DX1QN8DIdet/', enabled: true },
  { id: 'paris-normandie', kind: 'article', title: 'Étoiles gourmandes 2026', subtitle: "Bibou’s Burgers dans Paris-Normandie · Lire l’article", url: 'https://www.paris-normandie.fr/id717021/article/2026-05-11/etoiles-gourmandes-2026-bibous-burgers-des-burgers-faits-maison-aux-saveurs', imageUrl: 'https://prmeng.rosselcdn.net/sites/default/files/dpistyles_v2/prm_scale_736w/2026/05/11/node_717021/59096972/public/2026/05/11/76410790.jpeg?itok=_a-a2B7-1784644032', enabled: true },
  { id: 'social', kind: 'social', title: 'Suivez-nous', subtitle: '', enabled: true },
];
const safePublicUrl = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.') && !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) && !u.hostname.endsWith('.local'); } catch { return false; }
};
module.exports = { DEFAULT_NEWS, safePublicUrl };
