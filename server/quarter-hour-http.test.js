const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { createCustomerSession } = require("./customer-session");
const { parisDateKey } = require("./availability");

test("API : quarts d’heure, bonus non falsifiable et capacité partagée atomique", { timeout: 15000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bibou-hours-http-"));
  const databaseFile = path.join(directory, "data.json");
  const customer = { id: "hours-test", name: "Client fictif", phone: "+33600000000", points: 0, weeklyOrders: 0 };
  await fs.writeFile(databaseFile, JSON.stringify({ customers: [customer], orders: [], nextOrderNumber: 1 }));
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], { cwd: directory,
    env: { PATH: process.env.PATH, PORT: "0", DATA_FILE_PATH: databaseFile, SESSION_SECRET: "test-hours-only" },
    stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, "exit"); await fs.rm(directory, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    let output = "", errors = "";
    child.stderr.on("data", data => { errors += data; });
    child.stdout.on("data", data => { output += data; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) resolve(match[0] + "/api"); });
    child.on("error", reject);
    child.on("exit", code => reject(new Error("API test exited " + code + errors)));
  });
  const token = createCustomerSession(customer.id, "test-hours-only");
  const request = async (route, body) => {
    const response = await fetch(base + route, { method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const date = parisDateKey(new Date(Date.now() + 86400000));
  const pickup = await request("/availability?method=pickup&date=" + date);
  const delivery = await request("/availability?date=" + date);
  const table = await request("/reservation-availability?date=" + date);
  assert.equal(pickup.status, 200);
  assert.equal(pickup.data.slots["19:15"].pickupAdvanceEligible, true);
  assert.equal(pickup.data.slots["19:00 – 19:30"], undefined);
  assert.equal(delivery.data.slots["19:15"], undefined);
  assert.equal(delivery.data.slots["19:00 – 19:30"].remaining, 2);
  assert.equal(table.data.capacityWindowMinutes, 30);
  assert.equal((await request("/availability?method=bad&date=" + date)).status, 400);

  const order = { customerId: customer.id, method: "pickup", serviceDate: date, slot: "19:15",
    items: [{ productId: "drink-coca", quantity: 1, selections: [] }],
    createdAt: "2099-01-01T00:00:00Z", pickupAdvanceBonusApplied: false, loyaltyBasePoints: 99999 };
  const result = await request("/orders", order);
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal(result.data.order.slot, "19:15");
  assert.equal(result.data.order.pickupAdvanceBonusApplied, true);
  assert.notEqual(result.data.order.createdAt, order.createdAt);
  assert.equal(result.data.order.loyaltyBasePoints, 0);
  assert.equal((await request("/orders", { ...order, slot: "19:00 – 19:30" })).status, 400);
  assert.equal((await request("/orders", { ...order, method: "delivery" })).status, 400);
  const reservation = { name: "Client fictif", phone: customer.phone, guests: 4, serviceDate: date };
  const results = await Promise.all(["19:00", "19:15", "19:15"].map(slot => request("/reservations", { ...reservation, slot })));
  assert.deepEqual(results.map(item => item.status).sort(), [201, 201, 400]);
  const remaining = (await request("/reservation-availability?date=" + date)).data.slots;
  assert.equal(remaining["19:00"].full, true);
  assert.equal(remaining["19:15"].full, true);
  assert.equal(remaining["19:30"].remaining, 2);
  assert.equal((await request("/reservations", { ...reservation, slot: "19:30 – 20:00" })).status, 400);
  const saved = JSON.parse(await fs.readFile(databaseFile, "utf8"));
  assert.equal(saved.customers[0].points, 0); // No payment, no points, no external provider.
});
