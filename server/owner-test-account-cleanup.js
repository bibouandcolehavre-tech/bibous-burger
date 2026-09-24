const { anonymizeCustomerAccount } = require('./account-deletion');

const CLEANUP_KEY = 'ownerTestAccountsRemoved20260924';
const digits = value => String(value || '').replace(/\D/g, '').replace(/^(?:0033|33)(?=\d{9}$)/, '0');
const normalizedName = value => String(value || '').trim().toLocaleLowerCase('fr-FR');
const AUTHORIZED_TEST_ACCOUNTS = new Set([
  'client bibou|0767656655',
  'juste|0656565656',
  'arnaud laurent|078313416',
  'arnaud laurent|0783139416'
]);

function removeAuthorizedOwnerTestAccounts(database, now = new Date()) {
  database.maintenance ||= {};
  if (database.maintenance[CLEANUP_KEY]) return [];
  const targets = (database.customers || []).filter(customer => AUTHORIZED_TEST_ACCOUNTS.has(`${normalizedName(customer.name)}|${digits(customer.phone)}`));
  if (!targets.length) return [];
  const removed = targets.map(customer => ({ id: customer.id, name: customer.name, phone: customer.phone, deletion: anonymizeCustomerAccount(database, customer, now) }));
  database.maintenance[CLEANUP_KEY] = { completedAt: now.toISOString(), removed: removed.length };
  return removed;
}

module.exports = { CLEANUP_KEY, removeAuthorizedOwnerTestAccounts };
