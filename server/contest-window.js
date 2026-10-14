const { serviceSlotInstant } = require('./availability');
const DAY = 86400000;
const dateValid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const timeValid = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const shiftDate = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
function contestWindow(contest = {}) {
  const startTime = contest.startTime || '00:00';
  if (!dateValid(contest.startDate) || !dateValid(contest.endDate) || !timeValid(startTime) || contest.endDate < contest.startDate) return null;
  return { startsAt: serviceSlotInstant(contest.startDate, startTime).toISOString(),
    endsAt: serviceSlotInstant(shiftDate(contest.endDate, 1), '00:00').toISOString() };
}
function createContestDateFilter(contest) {
  const window = contestWindow(contest), start = Date.parse(window?.startsAt), end = Date.parse(window?.endsAt);
  return value => { const at = Date.parse(value); return Number.isFinite(at) && at >= start && at < end; };
}
function withinContest(contest, value) { return createContestDateFilter(contest)(value); }
module.exports = { dateValid, timeValid, shiftDate, contestWindow, withinContest, createContestDateFilter };
