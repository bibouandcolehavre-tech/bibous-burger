// Public display only. Entering the screen never joins or accepts the rules.
const calendarDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T12:00:00Z'))
  && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
const parisDay = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
const dayLabel = day => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' }).format(new Date(day + 'T12:00:00Z'));

function contestEntry(data, now = Date.now()) {
  const neutral = { eyebrow: 'LE CONCOURS BIBOU', title: 'Découvre le concours Bibou', detail: 'Retrouve le règlement et les conditions de participation.', action: 'Découvrir le concours' };
  if (!data || !Number.isFinite(now)) return neutral;
  if (data.status === 'inactive') return null;
  if (!calendarDay(data.startDate) || !calendarDay(data.endDate) || data.startDate > data.endDate) return neutral;
  const today = parisDay(now);
  if (data.status === 'closed' || today > data.endDate) return { eyebrow: 'LE CONCOURS BIBOU', title: 'Le concours est terminé', detail: 'Retrouve le règlement et le classement dans le concours.', action: 'Consulter le concours' };
  if (data.status === 'scheduled' || today < data.startDate) return { eyebrow: 'LE CONCOURS BIBOU', title: 'Le concours se prépare', detail: `Ouverture le ${dayLabel(data.startDate)}${/^\d{2}:\d{2}$/.test(data.startTime || '') ? ' à ' + data.startTime.replace(':', ' h ') : ''} · heure de Paris.`, action: 'Découvrir le concours' };
  if (data.status !== 'active') return neutral;
  return { eyebrow: `JUSQU’AU ${dayLabel(data.endDate).toLocaleUpperCase('fr-FR')}`, title: 'Des menus à gagner chez Bibou', detail: 'Participation gratuite · un classement commun iPhone, Android et web.', action: 'Participer au concours' };
}
module.exports = { contestEntry };
