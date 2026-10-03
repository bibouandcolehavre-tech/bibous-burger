const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createDatabaseLock } = require('./database-lock');

const MODULE_IDS = Object.freeze(['pickup', 'delivery', 'tables']);
const DEFAULT_MODULES = Object.freeze({ pickup: true, delivery: true, tables: true });
const cloneDefault = () => ({ revision: 0, modules: { ...DEFAULT_MODULES } });

function validateStored(value) {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      !value.modules || Object.keys(value.modules).length !== MODULE_IDS.length ||
      MODULE_IDS.some(id => typeof value.modules[id] !== 'boolean')) {
    throw Object.assign(new Error('Configuration des services invalide.'), { statusCode: 503 });
  }
  return { revision: value.revision, modules: Object.fromEntries(MODULE_IDS.map(id => [id, value.modules[id]])) };
}

function createServiceModuleStore(file) {
  const acquire = createDatabaseLock();
  async function read() {
    try { return validateStored(JSON.parse(await fs.readFile(file, 'utf8'))); }
    catch (error) {
      if (error.code === 'ENOENT') return cloneDefault();
      if (error.statusCode) throw error;
      throw Object.assign(new Error('Configuration des services indisponible.'), { statusCode: 503 });
    }
  }
  async function update(input) {
    if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0 ||
        !input.modules || typeof input.modules !== 'object' || Array.isArray(input.modules) ||
        !Object.keys(input.modules).length ||
        Object.entries(input.modules).some(([id, enabled]) => !MODULE_IDS.includes(id) || typeof enabled !== 'boolean')) {
      throw Object.assign(new Error('Modifications de services invalides.'), { statusCode: 400 });
    }
    const release = await acquire();
    try {
      const current = await read();
      if (input.revision !== current.revision) throw Object.assign(new Error('La configuration a changé. Rechargez-la avant de réessayer.'), { statusCode: 409 });
      const modules = { ...current.modules, ...input.modules };
      if (MODULE_IDS.every(id => modules[id] === current.modules[id])) return current;
      const next = { revision: current.revision + 1, modules };
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
        await fs.rename(temporary, file);
      } finally { await fs.unlink(temporary).catch(() => {}); }
      return next;
    } finally { release(); }
  }
  return { read, update };
}

module.exports = { MODULE_IDS, DEFAULT_MODULES, createServiceModuleStore };
