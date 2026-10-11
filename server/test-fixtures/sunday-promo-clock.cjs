// Frozen time only in the isolated Sunday promotion regression test.
if (process.env.NODE_ENV !== 'test' || process.env.FAKE_SUNDAY_PROMO_CLOCK !== 'true') throw Error('Test fixture only');
const RealDate=Date, fixed=RealDate.parse('2026-10-11T12:00:00.000Z');
global.Date=class extends RealDate {
  constructor(...args){super(...(args.length ? args : [fixed]));}
  static now(){return fixed;}
};
