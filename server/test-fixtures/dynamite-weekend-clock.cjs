if (process.env.NODE_ENV !== 'test' || process.env.FAKE_DYNAMITE_WEEKEND_CLOCK !== 'true') throw Error('Test fixture only');
const RealDate = Date;
const fixed = RealDate.parse('2026-10-16T12:00:00.000Z');
global.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [fixed])); }
  static now() { return fixed; }
};
global.fetch = async () => { throw Error('External requests forbidden in weekend test'); };
