const parisClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function slotAlreadyStarted(dateKey, slot, now = new Date()) {
  const match = /^(\d{2}):(\d{2})(?:$|\s)/.exec(String(slot || ''));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) || !match) return true;
  const parts = Object.fromEntries(parisClock.formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  if (dateKey !== today) return dateKey < today;
  return Number(match[1]) * 60 + Number(match[2]) <= Number(parts.hour) * 60 + Number(parts.minute);
}

module.exports = { slotAlreadyStarted };
