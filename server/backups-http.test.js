const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { decodeBackup } = require("./backups");
const { createCustomerSession } = require("./customer-session");

test("API sauvegardes : accès restaurant uniquement, données et stocks récupérables sans secrets", { timeout: 15000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bibou-backup-http-"));
  const databasePath = path.join(directory, "data.json");
  const database = { customers: [{ id: "backup-client", name: "Fictif", phone: "+33600000000", points: 200 }], orders: [], reservations: [], nextOrderNumber: 1 };
  await fs.writeFile(databasePath, JSON.stringify(database));
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], { cwd: directory, env: { PATH: process.env.PATH, PORT: "0", DATA_FILE_PATH: databasePath, RESTAURANT_DASHBOARD_PASSWORD: "backup-test-only", SESSION_SECRET: "backup-secret-test-only" }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, "exit"); await fs.rm(directory, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    let output = "";
    child.stdout.on("data", (data) => { output += data; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) resolve(`${match[0]}/api`); });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`API arrêtée : ${code}`)));
  });
  const request = (route, token = "", method = "GET", data) => fetch(`${base}${route}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(data ? { body: JSON.stringify(data) } : {}) });
  for (const token of ["", createCustomerSession("backup-client", "backup-secret-test-only")]) {
    assert.equal((await request("/dashboard/backups", token)).status, 401);
    assert.equal((await request("/dashboard/backups", token, "POST")).status, 401);
    assert.equal((await request("/dashboard/backups/anything", token)).status, 401);
  }
  const token = (await (await request("/dashboard/auth/login", "", "POST", { password: "backup-test-only" })).json()).token;
  const response = await request("/dashboard/backups", token, "POST");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const status = await response.json();
  assert.ok(status.copies.length);
  assert.equal(status.stale, false);
  assert.equal(JSON.stringify(status).includes("Fictif"), false);
  const exported = await request(`/dashboard/backups/${status.copies[0].id}`, token);
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get("content-type"), "application/gzip");
  assert.match(exported.headers.get("content-disposition"), /^attachment;/);
  assert.equal(exported.headers.get("cache-control"), "no-store");
  const snapshot = await decodeBackup(Buffer.from(await exported.arrayBuffer()));
  assert.deepEqual(snapshot.data.database, database);
  assert.deepEqual(snapshot.data.stock, {});
  assert.equal(JSON.stringify(snapshot).includes("backup-secret-test-only"), false);
  assert.equal(JSON.stringify(snapshot).includes("backup-test-only"), false);
  assert.equal((await request("/dashboard/backups/unknown", token)).status, 404);
  assert.equal((await request("/dashboard/backups", token, "DELETE")).status, 405);
  assert.equal((await request("/dashboard/catalog/drink-coca", token, "PATCH", { available: false })).status, 200);
  const latest = await (await request("/dashboard/backups", token, "POST")).json();
  const withStock = await request(`/dashboard/backups/${latest.copies[0].id}`, token);
  assert.equal((await decodeBackup(Buffer.from(await withStock.arrayBuffer()))).data.stock["drink-coca"], false);
  assert.deepEqual(JSON.parse(await fs.readFile(databasePath)), database); // Backup never mutates live data.
});
