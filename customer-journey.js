const { kioskRecipeGroup } = require('./consumer-recipe');
const { visibleCustomerProducts, applyProductStock } = require('./stock-client');
const { isCheeseNaan, lunchSlot } = require('./cheese-naans');
const CUSTOMER_CATEGORIES = [
  { id: 'menus', label: 'Nos menus', icon: '🍔', detail: 'Burger + frites + boisson' },
  { id: 'burgers', label: 'Nos burgers seuls', icon: '🍔', detail: 'Ta recette, sans menu' },
  { id: 'naans', label: 'Nos cheese naans', icon: '🫓', detail: 'Seul ou en menu · uniquement le midi' },
  { id: 'snacks', label: 'Petites faims', icon: '🍟', detail: 'Solo, Duo et petits plus' },
  { id: 'desserts', label: 'Nos desserts', icon: '🍰', detail: 'À la carte · 3,90 €' },
  { id: 'drinks', label: 'Boissons', icon: '🥤', detail: 'Ton choix bien frais' },
];
const RECIPE_PROTEINS = {
  montagnes: 'Steak de bœuf', classique: 'Steak de bœuf', 'gros-lard': 'Steak de bœuf',
  atlas: 'Agneau effiloché', duck: 'Canard effiloché', dynamite: 'Tenders spicy',
  hambagu: 'Steak hambagu (50 % porc, 50 % bœuf)', basilic: 'Steak de bœuf',
  pork: 'Porc effiloché', taurus: 'Jambon de Parme',
};
function consumerRecipeGroup(group, choices, product) {
  const result = kioskRecipeGroup(group, choices);
  if (group.id === 'protein') return { ...result, options: result.options.map(option => option.id === 'viande' ? { ...option, label: RECIPE_PROTEINS[product.id.replace(/-menu$/, '')] || product.name } : option) };
  if (group.id === 'sauces') return { ...result, options: result.options.map(option => option.id === 'bleu' ? { ...option, label: 'Sauce au bleu (faite maison)' } : option) };
  return result;
}
function naanOptionGroups(choices, drinks, desserts) {
  const groups = [{ id: 'naan-format', title: 'Naan seul ou en menu ?', required: true, min: 1, max: 1, options: [{ id: 'solo', label: 'Naan seul · 7,90 €', price: 0 }, { id: 'menu', label: 'Menu · 10,90 €', price: 3 }] }];
  if (choices['naan-format']?.includes('menu')) {
    groups.push({ id: 'naan-side', title: 'Frites ou dessert ?', required: true, min: 1, max: 1, options: [{ id: 'fries', label: 'Frites maison', price: 0 }, { id: 'dessert', label: 'Un dessert', price: 0 }] });
    if (choices['naan-side']?.includes('dessert')) groups.push({ id: 'naan-dessert', title: 'Choisis ton dessert', required: true, min: 1, max: 1, options: desserts.map(o => ({ ...o, price: 0 })) });
    groups.push({ ...drinks, title: 'Choisis ta boisson', required: true, min: 1, max: 1, options: drinks.options.map(o => ({ ...o, price: 0 })) });
  }
  return groups;
}
function clearNaanChoices(choices, group, next) {
  const result = { ...choices, [group]: next };
  if (group === 'naan-format' && next.includes('solo')) for (const key of ['naan-side', 'naan-dessert', 'drink']) delete result[key];
  if (group === 'naan-side' && next.includes('fries')) delete result['naan-dessert'];
  return result;
}
function customerProducts(category, collections, catalog) {
  const products = category === 'menus' ? collections.products.filter(p => p.isMenu)
    : category === 'burgers' ? collections.products.filter(p => !p.isMenu)
    : category === 'naans' ? collections.naans : category === 'snacks' ? collections.snacks
    : category === 'desserts' ? collections.desserts : category === 'drinks' ? collections.drinks : [];
  const visible = visibleCustomerProducts(products, catalog).map(p => ({ ...applyProductStock(p, catalog), satisfaction: catalog?.products?.find(entry => entry.id === p.id)?.satisfaction || null }));
  if (category === 'burgers') {
    const order = collections.products.filter(p => p.isMenu).map(p => p.id.replace(/-menu$/, ''));
    return visible.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  return visible;
}
function loyaltyMilestoneProgress(points, rewards) {
  points = Math.max(0, Number(points) || 0);
  return { points, next: rewards.find(r => r.points > points) || null,
    stages: rewards.map((reward, index) => ({ ...reward, fraction: Math.max(0, Math.min(1, (points - (rewards[index - 1]?.points || 0)) / (reward.points - (rewards[index - 1]?.points || 0)))) })) };
}
function cartMealFacts(items = []) {
  const selected = (item, group, id) => item.selections?.some(c => c.groupId === group && (!id || c.id === id));
  const isMenu = item => item.product.isMenu || item.product.kind === 'solo' || item.product.id === 'taurus' || (isCheeseNaan(item.product.id) && selected(item, 'naan-format', 'menu'));
  return {
    hasMenu: items.some(isMenu),
    missingMenuDrink: items.some(item => isMenu(item) && !selected(item, 'drink')),
    incompleteNaan: items.some(item => isCheeseNaan(item.product.id) && (!selected(item, 'naan-format') || (selected(item, 'naan-format', 'menu') && (!selected(item, 'naan-side') || (selected(item, 'naan-side', 'dessert') && !selected(item, 'naan-dessert')))))),
    hasDessert: items.some(item => item.product.id.startsWith('dessert-') || item.selections?.some(c => ['desserts', 'menu-desserts', 'solo-dessert', 'duo-dessert-one', 'duo-dessert-two', 'naan-dessert'].includes(c.groupId))),
    hasDrink: items.some(item => item.product.id.startsWith('drink-') || item.selections?.some(c => c.groupId === 'drink' || c.groupId.startsWith('duo-drink'))),
    hasSide: items.some(item => item.product.id.startsWith('frites-') || selected(item, 'naan-side', 'fries') || item.selections?.some(c => ['menu-fries', 'solo-fries', 'duo-fries-one', 'duo-fries-two', 'sides'].includes(c.groupId))),
  };
}
function customerServiceSlots(items, slots) {
  return items?.some(item => isCheeseNaan(item.product?.id || item.productId)) ? slots.filter(lunchSlot) : slots;
}
function customerNavigationTab(screen) {
  if (['orders', 'review', 'success'].includes(screen)) return 'orders';
  if (['account', 'identity', 'login', 'offers', 'crm-welcome', 'notifications', 'notifications-welcome', 'loyalty', 'bibou-plus', 'bibou-plus-pending', 'delete-account', 'privacy', 'reservations'].includes(screen)) return 'account';
  if (['customer-service', 'customer-categories', 'customer-catalog', 'product', 'custom-burger-preview', 'cart', 'delivery', 'details', 'payment', 'payment-pending', 'reservation-meal', 'reservation-payment-pending'].includes(screen)) return 'card';
  return 'home';
}
module.exports = { CUSTOMER_CATEGORIES, RECIPE_PROTEINS, consumerRecipeGroup, naanOptionGroups, clearNaanChoices, customerProducts, loyaltyMilestoneProgress, cartMealFacts, customerServiceSlots, customerNavigationTab };
