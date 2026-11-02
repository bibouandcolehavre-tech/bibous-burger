const core = require('./core');
const providers = require('./providers');
function createWorker({ config, transact, updateGoogle = providers.createGoogleUpdater(config), pushApple = device => providers.applePush(config, device) }) {
  let running = false;
  return async () => {
    if (!config.enabled || running) return;
    running = true;
    try {
      const passes = await transact(database => {
        // Include presentation-only changes (such as venue relevance) before
        // taking the delivery snapshot, without changing the loyalty balance.
        core.reconcile(database);
        for (const w of database.clubWalletRevocations || []) if (Date.parse(w.expiresAt) <= Date.now()) w.devices = [];
        const expired = (database.clubWalletRevocations || []).filter(w => Date.parse(w.expiresAt) <= Date.now()
          && (!w.googleIssued || w.googleSyncedRevision === w.revision));
        if (expired.length) database.clubWalletRevocations = database.clubWalletRevocations.filter(w => !expired.includes(w));
        return [...database.customers.filter(c => c.clubWallet).map(c => core.findPass(database, c.clubWallet.serial)),
          ...(database.clubWalletRevocations || []).map(w => core.findPass(database, w.serial))].map(p => structuredClone(p));
      }, true);
      for (const pass of passes) {
        const revision = pass.wallet.revision;
        if (config.google.enabled && pass.wallet.googleIssued && pass.wallet.googleSyncedRevision !== revision) {
          try {
            if (await updateGoogle(pass)) await transact(database => { const current = core.findPass(database, pass.memberId); if (current) current.wallet.googleSyncedRevision = revision; }, true);
          } catch { /* Persisted revision remains pending. No names, credentials or links in logs. */ }
        }
        if (!config.apple.enabled || !pass.wallet.appleIssued) continue;
        for (const device of pass.wallet.devices || []) {
          if (device.notifiedRevision >= revision) continue;
          try {
            const status = await pushApple(device);
            if (status === 200 || status === 410) await transact(database => {
              const current = core.findPass(database, pass.memberId); if (!current) return;
              if (status === 410) current.wallet.devices = current.wallet.devices.filter(d => d.pushToken !== device.pushToken);
              else { const d = current.wallet.devices.find(d => d.deviceId === device.deviceId && d.pushToken === device.pushToken); if (d) d.notifiedRevision = revision; }
            }, true);
          } catch { /* Retry on the next bounded tick, outside the order lock. */ }
        }
      }
    } finally { running = false; }
  };
}
module.exports = { createWorker };
