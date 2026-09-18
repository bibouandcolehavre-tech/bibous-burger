// No production writes, payment calls or automatic overwrite in this tool.
const fs = require("node:fs/promises");
const path = require("node:path");
const { decodeBackup, MAX_FILE_BYTES } = require("./backups");

async function readBackup(file) {
  if ((await fs.stat(file)).size > MAX_FILE_BYTES) throw new Error("Copie trop volumineuse.");
  return decodeBackup(await fs.readFile(file));
}

async function extractBackup(file, destination) {
  const snapshot = await readBackup(file);
  // mkdir without recursive refuses ALL existing destinations, even empty ones.
  await fs.mkdir(destination, { mode: 0o700 });
  try {
    for (const [name, data] of [["data.json", snapshot.data.database], ["product-stock.json", snapshot.data.stock]]) {
      await fs.writeFile(path.join(destination, name), `${JSON.stringify(data, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    }
  } catch (error) {
    // Leave partial files in place for inspection; never delete an operator's data.
    throw new Error(`Extraction incomplète. Ne pas utiliser ce dossier (${error.code || "erreur"}).`);
  }
  return snapshot.createdAt;
}

if (require.main === module) {
  const [command, file, destination, ...extra] = process.argv.slice(2);
  (async () => {
    if (extra.length || !file || !["--check", "--extract"].includes(command) || (command === "--extract" ? !destination : destination)) throw new Error("Usage : node server/restore-backup.js --check COPIE | --extract COPIE NOUVEAU_DOSSIER");
    const createdAt = command === "--check" ? (await readBackup(file)).createdAt : await extractBackup(file, destination);
    console.log(`Copie vérifiée du ${createdAt}. ${command === "--extract" ? "Fichiers extraits séparément. La production n’a pas été modifiée." : "Aucune donnée modifiée."}`);
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { readBackup, extractBackup };
