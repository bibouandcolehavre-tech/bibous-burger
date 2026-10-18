'use strict';
// Explicit test child preload ONLY. Never imported by production modules.
if (process.env.NODE_ENV !== 'test') throw Error('Test fixture requires NODE_ENV=test');
const Module = require('node:module'), original = Module._load;
Module._load = function (id, parent, isMain) {
  if (id === './krokli-field-test-access.json' && parent?.filename.endsWith('/server/server.js'))
    return { enabled: true, accessHash: process.env.FIELD_FIXTURE_HASH, expiresAt: process.env.FIELD_FIXTURE_EXPIRY };
  return original.apply(this, arguments);
};
global.fetch = async () => { throw Error('External requests forbidden in field-test fixture.'); };
