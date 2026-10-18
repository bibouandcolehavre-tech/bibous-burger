const SUNDAY_SERVICE_NOTICE = 'Le dimanche, de 19 h à 21 h : click & collect et livraison uniquement. Pas de repas sur place.';

const isSundayService = (now = new Date()) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Paris', weekday: 'short'
}).format(now) === 'Sun';

const isTableServiceDate = dateKey => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return false;
  const date = new Date(`${dateKey}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateKey && date.getUTCDay() !== 0;
};

module.exports = { SUNDAY_SERVICE_NOTICE, isSundayService, isTableServiceDate };
