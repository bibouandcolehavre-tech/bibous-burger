const { parisDateKey } = require('./availability');
const dayOf = value => Number.isFinite(Date.parse(value)) ? parisDateKey(new Date(value)) : null;
const validDay = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
function eligibleBirthdayDate(customer, date) {
  if (!validDay(date) || date.slice(5) !== customer.crmPreferences?.birthday) return false;
  const registered = dayOf(customer.createdAt), recorded = dayOf(customer.crmPreferences?.birthdayRecordedAt);
  if ((registered && date <= registered) || (recorded && date <= recorded)) return false;
  const first = customer.crmPreferences?.birthdayEligibleFrom;
  return !first || (validDay(first) && date >= first);
}
function nextBirthdayDate(birthday, now) {
  if (!birthday) return null;
  const today = parisDateKey(new Date(now)), year = Number(today.slice(0, 4));
  // 29 February keeps the existing real-calendar policy; do not invent a date.
  for (let i = 0; i <= 8; i++) {
    const candidate = `${year + i}-${birthday}`;
    if (validDay(candidate) && candidate > today) return candidate;
  }
  return null;
}
function birthdayTrigger(customer, now) {
  const today = parisDateKey(new Date(now)), registered = dayOf(customer.createdAt);
  if (registered && registered >= today) return null; // No birthday discount on sign-up day, even as an eve-of-birthday offer.
  const next = new Date(`${today}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  for (const date of [today, next.toISOString().slice(0, 10)]) if (eligibleBirthdayDate(customer, date)) return `birthday:${date.slice(0, 4)}`;
  return null;
}
function birthdayOfferEligible(customer, offer, now) {
  if (offer.ruleId !== 'birthday') return true;
  const year = /^birthday:(\d{4})$/.exec(offer.eventKey || '')?.[1];
  if (!year) return false;
  const date = `${year}-${customer.crmPreferences?.birthday || ''}`;
  if (offer.birthdayDate && offer.birthdayDate !== date) return false;
  const registered = dayOf(customer.createdAt);
  return !(registered && registered >= parisDateKey(new Date(now))) && eligibleBirthdayDate(customer, date);
}
module.exports = { eligibleBirthdayDate, nextBirthdayDate, birthdayTrigger, birthdayOfferEligible };
