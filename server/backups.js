const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { gzip, gunzip } = require("node:zlib");
const { promisify } = require("node:util");

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const HOUR = 3600000;
const DAY = 24 * HOUR;
const MAX_RAW_BYTES = 32 * 1024 * 1024;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const FILE_PATTERN = /^bibou-(\d{13})-([a-f0-9]{32})\.json\.gz$/;
const failure = (message) => Object.assign(new Error(message), { statusCode: 503 });
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function validateData(data) {
  if (!object(data) || !object(data.database) || !Array.isArray(data.database.customers) || !Array.isArray(data.database.orders) || !object(data.stock)) throw failure("Données de sauvegarde invalides.");
  for (const key of ["reservations", "rewardClaims", "bibouPlusPurchases"]) {
    if (data.database[key] !== undefined && !Array.isArray(data.database[key])) throw failure("Données de sauvegarde invalides.");
  }
  if (Object.values(data.stock).some((value) => typeof value !== "boolean")) throw failure("Disponibilités invalides.");
}

async function encodeBackup(data, now = new Date()) {
  validateData(data);
  const payload = JSON.stringify({ format: "bibou-backup", version: 1, createdAt: now.toISOString(), data });
  if (Buffer.byteLength(payload) > MAX_RAW_BYTES) throw failure("Données trop volumineuses : faites adapter la sauvegarde.");
  const envelope = JSON.stringify({ sha256: crypto.createHash("sha256").update(payload).digest("hex"), payload });
  const buffer = await compress(envelope);
  if (buffer.length > MAX_FILE_BYTES) throw failure("Copie trop volumineuse : faites adapter la sauvegarde.");
  return buffer;
}

async function decodeBackup(buffer) {
  try {
    if (buffer.length > MAX_FILE_BYTES) throw new Error();
    // JSON escaping can double the envelope size. Bound decompression as well.
    const envelope = JSON.parse(await decompress(buffer, { maxOutputLength: MAX_RAW_BYTES * 2 + 1024 }));
    if (typeof envelope.payload !== "string" || Buffer.byteLength(envelope.payload) > MAX_RAW_BYTES || !/^[a-f0-9]{64}$/.test(envelope.sha256)) throw new Error();
    if (crypto.createHash("sha256").update(envelope.payload).digest("hex") !== envelope.sha256) throw new Error();
    const snapshot = JSON.parse(envelope.payload);
    if (snapshot.format !== "bibou-backup" || snapshot.version !== 1 || !Number.isFinite(Date.parse(snapshot.createdAt))) throw new Error();
    validateData(snapshot.data);
    return snapshot;
  } catch { throw failure("Copie illisible, incomplète ou contrôle d’intégrité incorrect."); }
}

// Keep the newest copy per hour for 24 hours and per UTC day for 7 days.
// Always preserve the newest copy, even after a prolonged server outage.
function retainedIds(entries, now) {
  const keep = new Set();
  const hours = new Set();
  const days = new Set();
  for (const entry of [...entries].sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id))) {
    const hour = Math.floor(entry.timestamp / HOUR);
    const day = Math.floor(entry.timestamp / DAY);
    if (!keep.size || (now - entry.timestamp < DAY && !hours.has(hour) && hours.size < 24) || (now - entry.timestamp < 7 * DAY && !days.has(day) && days.size < 7)) keep.add(entry.id);
    hours.add(hour);
    days.add(day);
  }
  return keep;
}

function createBackupStore({ directory, capture, clock = () => new Date(), budgetBytes = MAX_TOTAL_BYTES, freeSpaceBytes = async () => { const stat = await fs.statfs(directory); return stat.bavail * stat.bsize; } }) {
  let running = null;
  let lastError = null;
  let lastAttemptAt = null;
  const list = async () => {
    let files;
    try { files = await fs.readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
    const entries = await Promise.all(files.filter((file) => file.isFile() && FILE_PATTERN.test(file.name)).map(async (file) => {
      try { return { id: file.name, timestamp: Number(file.name.match(FILE_PATTERN)[1]), bytes: (await fs.stat(path.join(directory, file.name))).size }; }
      catch (error) { if (error.code === "ENOENT") return null; throw error; }
    }));
    return entries.filter(Boolean).sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id));
  };
  const metadata = (entry) => ({ id: entry.id, createdAt: new Date(entry.timestamp).toISOString(), bytes: entry.bytes });
  const create = () => {
    if (running) return running;
    running = (async () => {
      const now = clock();
      lastAttemptAt = now.toISOString();
      try {
        const buffer = await encodeBackup(await capture(), now);
        await decodeBackup(buffer); // Verify before publishing or pruning anything.
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        const entries = await list();
        if (entries.reduce((sum, entry) => sum + entry.bytes, 0) + buffer.length > budgetBytes || await freeSpaceBytes() < buffer.length + 32 * 1024 * 1024) throw failure("Espace de sauvegarde insuffisant. Les copies existantes sont conservées.");
        const id = `bibou-${now.getTime()}-${crypto.randomBytes(16).toString("hex")}.json.gz`;
        const temporary = path.join(directory, `${id}.tmp`);
        try {
          const handle = await fs.open(temporary, "wx", 0o600);
          try { await handle.writeFile(buffer); await handle.sync(); } finally { await handle.close(); }
          await fs.rename(temporary, path.join(directory, id));
          await decodeBackup(await fs.readFile(path.join(directory, id)));
        } finally { await fs.unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; }); }
        const created = { id, timestamp: now.getTime(), bytes: buffer.length };
        const keep = retainedIds([created, ...entries], now.getTime());
        // A same-millisecond snapshot must never cause the new copy to disappear.
        keep.add(id);
        for (const entry of entries) if (!keep.has(entry.id)) await fs.unlink(path.join(directory, entry.id));
        lastError = null;
        return metadata(created);
      } catch (error) {
        lastError = error.statusCode === 503 ? error.message : "La copie n’a pas pu être enregistrée. Vérifiez les données et le disque du serveur.";
        throw failure(lastError);
      }
    })().finally(() => { running = null; });
    return running;
  };
  const status = async () => {
    const entries = await list();
    return { intervalMinutes: 60, retention: { hourlyHours: 24, dailyDays: 7 }, location: "server-disk", lastAttemptAt, lastError, stale: !entries.length || clock().getTime() - entries[0].timestamp > 2 * HOUR, copies: entries.map(metadata) };
  };
  const download = async (id) => {
    if (!FILE_PATTERN.test(id)) throw Object.assign(new Error("Copie introuvable."), { statusCode: 404 });
    // Do not follow symlinks or accept arbitrary filesystem paths.
    const entry = (await list()).find((item) => item.id === id);
    if (!entry) throw Object.assign(new Error("Copie introuvable."), { statusCode: 404 });
    if (entry.bytes > MAX_FILE_BYTES) throw failure("Copie trop volumineuse.");
    const buffer = await fs.readFile(path.join(directory, id));
    await decodeBackup(buffer);
    return buffer;
  };
  const runIfDue = async () => {
    const entries = await list();
    if (!entries.length || clock().getTime() - entries[0].timestamp >= HOUR) return create();
  };
  const start = ({ onError = () => {}, onSuccess = () => {}, intervalMs = 5 * 60 * 1000 } = {}) => {
    const tick = () => { void runIfDue().then((copy) => { if (copy) onSuccess(copy.createdAt); }).catch(() => { lastError ||= "Impossible de vérifier les copies sur le disque."; onError(lastError); }); };
    tick();
    const timer = setInterval(tick, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  };
  return { create, status, download, runIfDue, start };
}

module.exports = { createBackupStore, encodeBackup, decodeBackup, retainedIds, MAX_FILE_BYTES };
