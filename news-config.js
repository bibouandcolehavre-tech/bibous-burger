// Shared defaults keep the carousel useful during a temporary API outage.
const DEFAULT_NEWS = [
  { id: 'contest', kind: 'contest', title: 'Le concours se prépare', subtitle: 'Découvre le principe du parrainage · Ouverture à venir', enabled: true },
  { id: 'epicu', kind: 'video', title: 'Bibou vu par Epicu', subtitle: 'Le reportage du 2 mai 2026 · Voir la vidéo sur Instagram', url: 'https://www.instagram.com/epicu.lehavre.food/reel/DX1QN8DIdet/', enabled: true },
  { id: 'paris-normandie', kind: 'video', title: 'Paris-Normandie chez Bibou', subtitle: 'Le reportage du 13 juin 2025 · Voir la vidéo sur Facebook', url: 'https://www.facebook.com/presse.havraise/videos/bibous-burger/1226219005580139/', enabled: true },
  { id: 'social', kind: 'social', title: 'Suivez-nous', subtitle: '', enabled: true },
];
const safePublicUrl = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.') && !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) && !u.hostname.endsWith('.local'); } catch { return false; }
};
module.exports = { DEFAULT_NEWS, safePublicUrl };
