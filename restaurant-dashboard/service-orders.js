/* Presentation only: no API, payment, printing or delivery side effects. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KrokliServiceOrders = factory();
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  function validDay(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }
  function group(order, today) {
    const day = order.raw?.serviceDate;
    if (!validDay(day) || day < today || order.refund?.status === 'due') return 'check';
    return day > today ? 'future' : 'today';
  }
  function select(orders, period, today) {
    return orders.filter(order => period === 'future' ? group(order, today) === 'future' : group(order, today) !== 'future').slice().sort((a, b) => {
      const ga = group(a, today), gb = group(b, today);
      if ((ga === 'check') !== (gb === 'check')) return ga === 'check' ? -1 : 1;
      const da = validDay(a.raw?.serviceDate) ? a.raw.serviceDate : '', db = validDay(b.raw?.serviceDate) ? b.raw.serviceDate : '';
      return da.localeCompare(db) || String(a.raw?.slot || '').localeCompare(String(b.raw?.slot || '')) || Number(a.id) - Number(b.id);
    });
  }
  return Object.freeze({validDay, group, select});
});
