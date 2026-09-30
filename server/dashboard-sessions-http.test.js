const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

async function start(directory) {
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    cwd: directory,
    env: { PATH: process.env.PATH, PORT: '0', NODE_ENV: 'test', DATA_FILE_PATH: path.join(directory, 'data.json'), RESTAURANT_DASHBOARD_PASSWORD: 'dashboard-test-only', SESSION_SECRET: 'dashboard-session-test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const base = await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      const match = String(chunk).match(/http:\/\/localhost:\d+/);
      if (match) resolve(`${match[0]}/api`);
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`API exited ${code}`)));
  });
  return { child, base };
}

async function stop(child) {
  child.kill();
  if (child.exitCode === null) await once(child, 'exit');
}

test('le restaurant reste connecté après un redémarrage, puis la déconnexion révoque le jeton', { timeout: 15000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-dashboard-http-'));
  let running;
  t.after(async () => { if (running) await stop(running.child); await fs.rm(directory, { recursive: true, force: true }); });
  running = await start(directory);
  const login = await fetch(`${running.base}/dashboard/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'dashboard-test-only' }) });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  assert.equal((await fetch(`${running.base}/dashboard/orders`, { headers })).status, 200);
  await stop(running.child);
  running = await start(directory);
  assert.equal((await fetch(`${running.base}/dashboard/orders`, { headers })).status, 200);
  assert.equal((await fetch(`${running.base}/dashboard/auth/logout`, { method: 'POST', headers })).status, 200);
  assert.equal((await fetch(`${running.base}/dashboard/orders`, { headers })).status, 401);
});
