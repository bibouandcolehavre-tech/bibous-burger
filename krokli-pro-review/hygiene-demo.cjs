'use strict';

const { createHash, randomUUID } = require('node:crypto');
const http = require('node:http');
const hygiene = require('./hygiene-core.cjs');
const { MAX_REQUEST_LENGTH } = require('./hygiene-image.cjs');

const PREFIX = '/api/dashboard/hygiene';
const ROUTE = /^\/api\/dashboard\/hygiene(?:\/(checks|lots|labels|tasks)|\/photos\/([^/]+)|\/tasks\/([^/]+))?$/;
const SESSION_IDLE = 30 * 60 * 1000;
const MAX_SESSIONS = 16;
const MAX_ENTRIES = 100;
const MAX_PHOTO_STORAGE = 4 * 1024 * 1024;
const sessionKey = req => {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.headers.authorization || '')?.[1];
  return token && createHash('sha256').update(token).digest('hex');
};
const fail = (message, statusCode = 400) => { throw Object.assign(Error(message), { statusCode }); };

function checkAuthorization(port, authorization) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname:'127.0.0.1', port, path:'/api/dashboard/summary',
      headers:{ Accept:'application/json', Authorization:authorization } }, response => {
      response.resume();
      if (response.statusCode === 200) return resolve(true);
      if (response.statusCode === 401 || response.statusCode === 403) return resolve(false);
      reject(Error('Review authorization unavailable'));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(Error('Review authorization timed out')));
  });
}

async function readInput(req) {
  if (Number(req.headers['content-length'] || 0) > MAX_REQUEST_LENGTH) {
    req.resume();
    fail('Requête trop volumineuse.', 413);
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of req.iterator({ destroyOnReturn:false })) {
    length += chunk.length;
    if (length > MAX_REQUEST_LENGTH) {
      req.resume();
      fail('Requête trop volumineuse.', 413);
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail('Saisie de démonstration illisible.'); }
}

function seed(now) {
  const database = {};
  const operator = 'Équipe de démonstration';
  hygiene.append(database, 'checks', { id:randomUUID(), operator, kind:'fridge', subject:'Frigo exemple',
    result:'ok', temperature:3.2 }, now);
  hygiene.append(database, 'lots', { id:randomUUID(), operator, mode:'receipt', product:'Pain exemple',
    supplier:'Fournisseur fictif', lot:'EXEMPLE-01', packaging:'ok', result:'ok' }, now);
  const { today } = hygiene.journal(database, new URLSearchParams(), now);
  hygiene.append(database, 'labels', { id:randomUUID(), operator, product:'Sauce exemple', lot:'EXEMPLE-02',
    process:'prepared', preparedAt:`${today}T10:00`, expiresAt:`${today}T22:00` }, now);
  hygiene.createTask(database, { id:randomUUID(), label:'Nettoyer le plan de travail exemple', frequency:'daily' }, now);
  return database;
}

function createHygieneDemo(backendPort) {
  const sessions = new Map();
  function expire(now = Date.now()) {
    for (const [key, session] of sessions) if (now - session.usedAt >= SESSION_IDLE) sessions.delete(key);
  }
  setInterval(expire, 60_000).unref();

  return {
    forget(req) { sessions.delete(sessionKey(req)); },
    async handle(req, res, url, json) {
      if (url.pathname !== PREFIX && !url.pathname.startsWith(PREFIX + '/')) return false;
      try {
        const key = sessionKey(req);
        if (!key || !await checkAuthorization(backendPort, req.headers.authorization)) {
          sessions.delete(key);
          fail('Connectez-vous au restaurant de vérification.', 401);
        }
        const route = ROUTE.exec(url.pathname);
        if (!route) fail('Rubrique de démonstration introuvable.', 404);
        const [, section, photoId, taskId] = route;
        if (req.method !== (taskId ? 'DELETE' : section ? 'POST' : 'GET')) fail('Méthode non autorisée.', 405);
        const now = new Date();
        expire(now.getTime());
        let session = sessions.get(key);
        if (!session) {
          if (sessions.size >= MAX_SESSIONS) fail('Démonstration très sollicitée. Réessayez plus tard.', 503);
          session = { database:seed(now), photos:new Map(), photoBytes:0, usedAt:now.getTime() };
          sessions.set(key, session);
        }
        session.usedAt = now.getTime();
        if (photoId) {
          const meta = hygiene.photoFor(session.database, photoId);
          const bytes = session.photos.get(meta.sha256);
          if (!bytes) fail('Photo de démonstration introuvable.', 404);
          res.writeHead(200, { 'Content-Type':meta.mime, 'Content-Length':bytes.length,
            'Cache-Control':'no-store, private', 'X-Content-Type-Options':'nosniff' });
          res.end(bytes);
        } else if (taskId) {
          const { id } = hygiene.retireTask(session.database, taskId, now);
          json(res, 200, { id });
        } else if (!section) {
          json(res, 200, hygiene.journal(session.database, url.searchParams, now));
        } else {
          const input = await readInput(req);
          if (sessions.get(key) !== session) fail('La session de démonstration a expiré.', 401);
          // Stage writes so reaching a demo limit never leaves a partial entry or photo.
          const draft = structuredClone(session.database);
          const result = section === 'tasks' ? hygiene.createTask(draft, input, now) : hygiene.append(draft, section, input, now);
          const count = Object.values(draft.hygieneRegistry).reduce((total, entries) => total + entries.length, 0);
          if (count > MAX_ENTRIES) fail('Le registre de démonstration a atteint sa limite de 100 entrées.', 409);
          const { attachment, created, entry, task } = result;
          if (attachment && !session.photos.has(attachment.meta.sha256)) {
            if (session.photoBytes + attachment.bytes.length > MAX_PHOTO_STORAGE) {
              fail('La limite de photos de cette session de démonstration est atteinte.', 413);
            }
            session.photos.set(attachment.meta.sha256, attachment.bytes);
            session.photoBytes += attachment.bytes.length;
          }
          if (created) session.database = draft;
          json(res, created ? 201 : 200, task ? { task } : { entry });
        }
      } catch (error) {
        if (!res.headersSent) json(res, error.statusCode || 503,
          { error:error.statusCode ? error.message : 'Registre de démonstration temporairement indisponible.' });
        else res.end();
      }
      return true;
    },
  };
}

module.exports = { createHygieneDemo };
