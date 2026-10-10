// Kiosk-only presentation. Original phone choices and legacy order IDs stay intact.
const PROTEIN = { id: 'protein', title: 'Choisis ta protéine', helper: 'Viande, galette ou burger végétarien', required: true, min: 1, max: 1, options: [
  { id: 'viande', label: 'Viande', price: 0 },
  { id: 'galette-base', label: 'Galette de pommes de terre', price: 0 },
  { id: 'vegetarian', label: 'Burger végétarien', price: 0 },
] };
const vegetarianInstruction = 'Burger végétarien · galette de pommes de terre, sans viande, bacon ni lard';
function meatOption(option) {
  return (option.groupId === 'extras' && ['second-steak', 'bacon', 'lard'].includes(option.id))
    || (option.groupId === 'sides' && ['frites-cheddar', 'tenders'].includes(option.id))
    || (option.groupId === 'menu-fries' && option.id === 'cheddar-bacon');
}
function kioskRecipeGroup(group, choices) {
  if (group.id === 'protein') return PROTEIN;
  if (group.id === 'sauces') return { ...group, options: [...group.options, { id: 'bleu', label: 'Sauce au bleu', price: 0 }] };
  if (choices.protein?.includes('vegetarian')) return { ...group, options: group.options.filter(option => !meatOption({ ...option, groupId: group.id })) };
  return group;
}
function kioskRecipeChoices(choices, groupId, next) {
  const updated = { ...choices, [groupId]: next };
  if (groupId === 'protein' && next.some(id => ['galette-base','vegetarian'].includes(id))) delete updated['meat-type'];
  if (updated.protein?.includes('vegetarian')) {
    for (const key of ['extras','sides','menu-fries']) updated[key] = (updated[key] || []).filter(id => !meatOption({ groupId: key, id }));
    if (!updated['menu-fries']?.length) updated['menu-fries'] = ['maison'];
  }
  return updated;
}
module.exports = { PROTEIN, vegetarianInstruction, meatOption, kioskRecipeGroup, kioskRecipeChoices };

