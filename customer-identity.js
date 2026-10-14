const MAX_NAME_LENGTH = 60;
const normalizeName = value => typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
const validName = value => typeof value === 'string' && value.length <= MAX_NAME_LENGTH && /\p{L}/u.test(value) && /^[\p{L}\p{M} .’'\-]+$/u.test(value);
function validateIdentity(input = {}) {
  const firstName = normalizeName(input?.firstName), lastName = normalizeName(input?.lastName);
  if (!validName(firstName)) return { error: 'Indique ton prénom (60 caractères maximum, sans chiffre ni symbole).' };
  if (!validName(lastName)) return { error: 'Indique ton nom de famille (60 caractères maximum, sans chiffre ni symbole).' };
  return { firstName, lastName, name: `${firstName} ${lastName}` };
}
const hasCompleteIdentity = customer => Boolean(customer && !validateIdentity(customer).error);
function profileAddressChange(customer, input, editing) {
  const fields = ['address', 'postalCode', 'city'];
  if (!editing || fields.every(key => input[key] === (customer[key] || ''))) return { changed: false, payload: {} };
  if (fields.some(key => typeof input[key] !== 'string')) return { error: 'Vérifie ton adresse.' };
  const payload = Object.fromEntries(fields.map(key => [key, input[key].trim()]));
  if (payload.address.length > 200 || payload.city.length > 80 || payload.postalCode.length > 5) return { error: 'Vérifie la longueur de ton adresse.' };
  if ((payload.address || payload.postalCode) && (!payload.address || !/^\d{5}$/.test(payload.postalCode) || !payload.city)) return { error: 'Renseigne la rue, le code postal à cinq chiffres et la ville.' };
  return { changed: true, payload };
}
module.exports = { MAX_NAME_LENGTH, normalizeName, validateIdentity, hasCompleteIdentity, profileAddressChange };
