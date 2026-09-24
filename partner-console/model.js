(function (root) {
  'use strict';
  const MODULES = [
    { id: 'orders', name: 'Catalogue & commandes', group: 'Commander', icon: 'bag', description: 'La carte, les options et le suivi des commandes.', required: true, needs: [] },
    { id: 'pickup', name: 'Click & collect', group: 'Commander', icon: 'store', description: 'Des retraits à heure fixe, au rythme de la cuisine.', needs: ['orders'] },
    { id: 'delivery', name: 'Livraison', group: 'Commander', icon: 'truck', description: 'Zone, frais et capacité des créneaux de livraison.', needs: ['orders'] },
    { id: 'tables', name: 'Réservation de table', group: 'Accueillir', icon: 'calendar', description: 'Les réservations et le nombre de couverts.', needs: [] },
    { id: 'loyalty', name: 'Fidélité', group: 'Fidéliser', icon: 'star', description: 'Points, paliers et récompenses à votre image.', needs: ['orders'] },
    { id: 'referrals', name: 'Parrainage', group: 'Fidéliser', icon: 'people', description: 'Un programme pour recommander le restaurant.', needs: ['loyalty'] },
    { id: 'membership', name: 'Abonnement client', group: 'Fidéliser', icon: 'crown', description: 'Des avantages réservés aux clients abonnés.', needs: ['delivery', 'loyalty'] },
    { id: 'reviews', name: 'Avis Google', group: 'Communiquer', icon: 'message', description: 'Les avis et un lien vers la fiche du restaurant.', needs: [] },
    { id: 'notifications', name: 'Notifications', group: 'Communiquer', icon: 'bell', description: 'Suivi et actualités, avec l’accord de chaque client.', needs: [] },
  ];
  const COLORS = ['#A34732', '#486A54', '#6B5ACD', '#305F89', '#A06D19'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const modules = enabled => Object.fromEntries(MODULES.map(m => [m.id, m.required || enabled.includes(m.id)]));
  const initial = () => ({ version: 1, restaurants: [
    { id: 'demo-alba', name: 'Maison Alba', city: 'Le Havre', kind: 'Cuisine de saison', accent: COLORS[0], revision: 0, modules: modules(['pickup', 'delivery', 'tables', 'loyalty', 'reviews', 'notifications']) },
    { id: 'demo-miso', name: 'L’Atelier Miso', city: 'Rouen', kind: 'Cuisine japonaise', accent: COLORS[1], revision: 0, modules: modules(['pickup', 'loyalty']) },
  ], history: [] });

  function validate(restaurant) {
    if (!restaurant || !/^demo-[a-z0-9-]{1,60}$/.test(restaurant.id)) throw Error('Établissement de maquette invalide.');
    for (const [key, max] of [['name', 60], ['city', 60], ['kind', 60]]) {
      if (typeof restaurant[key] !== 'string' || !restaurant[key].trim() || restaurant[key].length > max) throw Error('Complète le nom, la ville et le type de cuisine (60 caractères maximum).');
    }
    if (!COLORS.includes(restaurant.accent)) throw Error('Choisis une des couleurs proposées.');
    if (!restaurant.modules || MODULES.some(m => typeof restaurant.modules[m.id] !== 'boolean')) throw Error('Configuration des modules invalide.');
    for (const m of MODULES) {
      if (m.required && !restaurant.modules[m.id]) throw Error('Le catalogue et les commandes sont le socle de l’application.');
      if (restaurant.modules[m.id] && m.needs.some(id => !restaurant.modules[id])) throw Error(`Il manque un module nécessaire à ${m.name}.`);
    }
    return restaurant;
  }

  function toggle(restaurant, id, enabled) {
    const result = clone(validate(restaurant)), target = MODULES.find(m => m.id === id);
    if (!target || typeof enabled !== 'boolean') throw Error('Module inconnu.');
    if (target.required && !enabled) throw Error('Ce module fait partie du socle.');
    function activate(key) {
      const module = MODULES.find(m => m.id === key);
      module.needs.forEach(activate);
      result.modules[key] = true;
    }
    if (enabled) activate(id);
    else {
      result.modules[id] = false;
      let changed;
      do {
        changed = false;
        for (const m of MODULES) if (result.modules[m.id] && m.needs.some(key => !result.modules[key])) {
          result.modules[m.id] = false; changed = true;
        }
      } while (changed);
    }
    return validate(result);
  }

  function differences(before, after) {
    const labels = { name: 'Nom', city: 'Ville', kind: 'Cuisine', accent: 'Couleur' };
    const result = Object.keys(labels).filter(key => before[key] !== after[key])
      .map(key => ({ label: labels[key], before: before[key], after: after[key] }));
    for (const m of MODULES) if (before.modules[m.id] !== after.modules[m.id]) result.push({ label: m.name, before: before.modules[m.id] ? 'Activé' : 'Désactivé', after: after.modules[m.id] ? 'Activé' : 'Désactivé' });
    return result;
  }

  function save(state, draft, at = new Date().toISOString()) {
    validate(draft);
    const next = clone(state), index = next.restaurants.findIndex(r => r.id === draft.id);
    if (index < 0) throw Error('Cet établissement n’existe pas dans la maquette.');
    const current = next.restaurants[index];
    if (draft.revision !== current.revision) throw Error('La fiche a changé dans un autre onglet. Recharge-la avant d’enregistrer.');
    const changes = differences(current, draft);
    if (!changes.length) return next;
    next.restaurants[index] = { ...clone(draft), revision: current.revision + 1 };
    next.history.unshift({ restaurantId: draft.id, name: draft.name, at, changes });
    next.history = next.history.slice(0, 100);
    return next;
  }

  function add(state, profile, id, at = new Date().toISOString()) {
    if (state.restaurants.length >= 20) throw Error('Cette maquette est limitée à 20 établissements fictifs.');
    if (state.restaurants.some(r => r.id === id)) throw Error('Cet identifiant existe déjà.');
    const restaurant = validate({ id, name: profile.name.trim(), city: profile.city.trim(), kind: profile.kind.trim(), accent: profile.accent, revision: 0, modules: modules([]) });
    return { ...clone(state), restaurants: [...clone(state.restaurants), restaurant], history: [{ restaurantId: id, name: restaurant.name, at, changes: [{ label: 'Établissement fictif', before: 'Absent', after: 'Créé dans la maquette' }] }, ...clone(state.history)].slice(0, 100) };
  }

  function restore(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.restaurants) || !value.restaurants.length || value.restaurants.length > 20 || !Array.isArray(value.history)) throw Error('Sauvegarde de maquette invalide.');
    const ids = new Set();
    const restaurants = value.restaurants.map(r => {
      validate(r);
      if (ids.has(r.id) || !Number.isSafeInteger(r.revision) || r.revision < 0) throw Error('Sauvegarde de maquette invalide.');
      ids.add(r.id);
      return { id: r.id, name: r.name, city: r.city, kind: r.kind, accent: r.accent, revision: r.revision, modules: Object.fromEntries(MODULES.map(m => [m.id, r.modules[m.id]])) };
    });
    const history = value.history.slice(0, 100).map(h => {
      if (!ids.has(h.restaurantId) || typeof h.name !== 'string' || h.name.length > 60 || !Number.isFinite(Date.parse(h.at)) || !Array.isArray(h.changes) || h.changes.length > 13) throw Error('Historique de maquette invalide.');
      const changes = h.changes.map(c => {
        if (['label', 'before', 'after'].some(k => typeof c[k] !== 'string' || c[k].length > 80)) throw Error('Historique de maquette invalide.');
        return { label: c.label, before: c.before, after: c.after };
      });
      return { restaurantId: h.restaurantId, name: h.name, at: h.at, changes };
    });
    return { version: 1, restaurants, history };
  }
  const api = { MODULES, COLORS, initial, clone, validate, toggle, differences, save, add, restore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PartnerModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
