const PORK_BURGERS = new Set(['taurus', 'hambagu', 'hambagu-menu', 'gros-lard', 'gros-lard-menu', 'montagnes', 'montagnes-menu', 'pork', 'pork-menu']);
const containsPork = product => PORK_BURGERS.has(typeof product === 'string' ? product : product?.id);
const porkOption = option => (option.groupId === 'extras' && ['bacon', 'lard'].includes(option.id)) || (option.groupId === 'sides' && option.id === 'frites-cheddar');
module.exports = { containsPork, porkOption };
