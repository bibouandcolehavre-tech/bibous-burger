const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { createCustomerSession } = require("./customer-session");

test("API clients : accès restaurant uniquement, réponses privées minimales, consultation sans écriture", { timeout: 15000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bibou-customers-http-"));
  const databaseFile = path.join(directory, "data.json");
  const database = { customers: [{ id: "test-customer", name: "Test Client", phone: "+33600000000", address: "PRIVATE-ADDRESS", points: 200 }], orders: [], nextOrderNumber: 1 };
  const original = JSON.stringify(database);
  await fs.writeFile(databaseFile, original);
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], { cwd: directory, env: { PATH: process.env.PATH, PORT: "0", DATA_FILE_PATH: databaseFile, RESTAURANT_DASHBOARD_PASSWORD: "customers-test-only", SESSION_SECRET: "customers-secret-test" }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, "exit"); await fs.rm(directory, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    let output = "";
    child.stdout.on("data", (data) => { output += data; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) resolve(`${match[0]}/api`); });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`API arrêtée : ${code}`)));
  });
  const request = (route, token = "", method = "GET", body) => fetch(`${base}${route}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const customerToken = createCustomerSession("test-customer", "customers-secret-test");
  for (const token of ["", customerToken]) for (const route of ["/dashboard/customers", "/dashboard/customers/test-customer"]) {
    const response = await request(route, token);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  const token = (await (await request("/dashboard/auth/login", "", "POST", { password: "customers-test-only" })).json()).token;
  const response = await request("/dashboard/customers?q=TEST", token);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const list = await response.json();
  assert.equal(list.total, 1);
  assert.equal(list.customers[0].points, 200);
  assert.equal(JSON.stringify(list).includes("PRIVATE-ADDRESS"), false);
  const detailResponse = await request("/dashboard/customers/test-customer", token);
  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.headers.get("cache-control"), "no-store");
  const detail = await detailResponse.json();
  assert.equal(detail.customer.prestige.level, 1);
  assert.equal(detail.rewards[0].status, "available");
  assert.equal(JSON.stringify(detail).includes("PRIVATE-ADDRESS"), false);
  assert.equal((await request("/dashboard/customers/missing", token)).status, 404);
  for (const method of ["PATCH", "POST", "DELETE"]) assert.equal((await request("/dashboard/customers/test-customer", token, method, { points: 999999 })).status, 405);
  assert.equal(await fs.readFile(databaseFile, "utf8"), original);
});
