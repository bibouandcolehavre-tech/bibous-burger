if (process.env.NODE_ENV !== 'test' || !process.env.FAKE_ROUTE_FILE) throw Error('Test fixture only');
const fs = require('node:fs/promises');
global.fetch = async url => {
  if (new URL(url).hostname !== 'routes.googleapis.com') throw Error('External network forbidden in delivery tests');
  return Response.json(JSON.parse(await fs.readFile(process.env.FAKE_ROUTE_FILE, 'utf8')));
};
