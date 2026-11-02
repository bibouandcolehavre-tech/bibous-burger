// Explicitly preloaded only in an isolated fictional HTTP test process.
if (process.env.NODE_ENV !== 'test' || process.env.FICTITIOUS_LUNCH_CLOCK !== 'true') throw Error('Isolated lunch test required');
const RealDate=Date, fixed=RealDate.parse('2026-11-03T11:05:00Z');
global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
