// Disposable HTTP test process only. Never imported by the production server.
const crypto = require('node:crypto'), fs = require('node:fs');
const original = crypto.randomInt;
if (process.env.NODE_ENV !== 'test' || !process.env.FICTITIOUS_WHEEL_ROLL_FILE) throw Error('Isolated test configuration required');
crypto.randomInt = function (...args) {
  if (args.length === 1 && args[0] === 100) return Number(fs.readFileSync(process.env.FICTITIOUS_WHEEL_ROLL_FILE, 'utf8'));
  return original.apply(this, args);
};
