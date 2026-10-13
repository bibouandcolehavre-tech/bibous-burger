if (process.env.NODE_ENV !== 'test' || process.env.FAKE_CONTEST_PRIZE_CLOCK !== 'true') throw Error('Test fixture only');
const RealDate = Date, fixed = RealDate.parse('2026-11-12T10:00:00.000Z');
global.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [fixed])); }
  static now() { return fixed; }
};
