(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KrokliPhoneContact = factory();
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  function href(value) {
    if (typeof value !== 'string' || value.length > 60 || !/^[+0-9\s().-]+$/.test(value)) return null;
    let number = value.trim().replace(/[\s().-]/g, '');
    if (number.startsWith('00')) number = '+' + number.slice(2);
    if (number.startsWith('+330')) number = '+33' + number.slice(4);
    if (/^0[1-9]\d{8}$/.test(number)) number = '+33' + number.slice(1);
    if (!/^\+[1-9]\d{7,14}$/.test(number)) return null;
    if (number.startsWith('+33') && !/^\+33[1-9]\d{8}$/.test(number)) return null;
    return 'tel:' + number;
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  function markup(value) {
    const target = href(value);
    if (!target) return `<span class="customer-call-unavailable">${value ? 'Numéro à vérifier : ' + escape(value) : 'Téléphone non renseigné'}</span>`;
    return `<a class="customer-call" href="${target}" aria-label="Appeler le client au ${escape(value)}"><span aria-hidden="true">☎</span><span>Appeler le client<strong class="customer-call-number">${escape(value)}</strong></span></a>`;
  }
  return Object.freeze({ href, markup });
});
