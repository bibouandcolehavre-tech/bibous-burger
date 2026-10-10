const { parisDateKey } = require('./availability');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
// A physical, provisioned restaurant device is the only source of an immediate
// order. Phone/web appointment validation is never relaxed by a client flag.
function immediateService(input, authorized, now = new Date()) {
  if (input.kioskService === undefined) return null;
  if (!authorized) fail('Accès borne requis.', 403);
  const service = input.kioskService;
  if (!service || Array.isArray(service) || !['here','take'].includes(service.mode)
      || Object.keys(service).some(key => key !== 'mode') || input.method !== 'pickup'
      || input.serviceDate !== undefined || input.slot !== undefined || input.tableReservation !== undefined) fail('Commande immédiate de la borne invalide.');
  const clock = new Intl.DateTimeFormat('fr-FR', { timeZone:'Europe/Paris', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(now);
  return { serviceDate:parisDateKey(now), slot:clock, kioskImmediate:true, kioskDiningMode:service.mode, dineIn:service.mode === 'here' };
}
function guestCustomer(session) {
  return session?.guest === true ? { id:session.customerId, name:'Client borne', phone:'', points:0, weeklyOrders:0, isKioskGuest:true } : null;
}
module.exports = { immediateService, guestCustomer };
