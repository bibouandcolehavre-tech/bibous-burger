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
module.exports = { MAX_NAME_LENGTH, normalizeName, validateIdentity, hasCompleteIdentity };
