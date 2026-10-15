(function (root) {
  'use strict';
  function createGpsPilot({ geolocation, send, onChange, now = Date.now, every = setInterval, cancelEvery = clearInterval }) {
    let epoch = 0, active = false, pending = false, watch = null, timer = null, session = null, latest = null, sending = false, lastSent = 0;
    let state = { active: false, pending: false, message: 'GPS facultatif · aucune position partagée.' };
    const show = message => { state = { active, pending, message }; onChange({ ...state }); };
    function clear() {
      active = pending = false;
      if (watch !== null) geolocation?.clearWatch(watch);
      if (timer !== null) cancelEvery(timer);
      watch = timer = latest = null;
    }
    async function stop(message = 'Essai GPS arrêté. Aucune nouvelle position partagée.') {
      epoch++; const old = session; session = null; clear(); show(message);
      if (old) { try { await send('stop', { sessionId: old.sessionId }); } catch { /* Server forgets the position within 90 seconds even offline. */ } }
    }
    async function transmit() {
      if (!active || sending || !session || !latest) return;
      if (now() >= Date.parse(session.expiresAt)) { void stop('Les 30 minutes sont terminées. Relance un essai si besoin.'); return; }
      if (now() - latest.timestamp > 30_000) { void stop('GPS interrompu. Relance l’essai ; la livraison reste possible.'); return; }
      if (latest.timestamp <= lastSent) return;
      const current = epoch, p = latest, own = session;
      sending = true;
      try {
        const response = await send('position', { sessionId: own.sessionId, position: p });
        if (current !== epoch) return;
        lastSent = p.timestamp;
        show(`Position reçue par Bibou à ${new Date(response.receivedAt).toLocaleTimeString('fr-FR')} · précision ±${Math.ceil(p.accuracy)} m.`);
      } catch {
        if (current === epoch) void stop('GPS ou réseau interrompu. Relance l’essai ; tes courses restent accessibles.');
      } finally { sending = false; }
    }
    async function start(consent) {
      if (active || pending) return;
      if (!consent) { show('Coche la case après avoir lu les informations du partage GPS.'); return; }
      if (!geolocation?.watchPosition) { show('GPS indisponible dans ce navigateur. Les livraisons restent accessibles.'); return; }
      const current = ++epoch, startedAt = now();
      pending = true; show('Préparation du partage GPS…');
      let opened;
      try {
        opened = await send('start', { consentVersion: 'bibou-foreground-gps-v1' });
        if (current !== epoch) { await send('stop', { sessionId: opened.sessionId }).catch(() => {}); return; }
        session = opened; lastSent = 0; pending = false; active = true;
        show('Autorise la localisation du téléphone. Recherche d’une position précise…');
        watch = geolocation.watchPosition(p => {
          if (current !== epoch || !active) return;
          const c = p.coords;
          if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude) || !Number.isFinite(c.accuracy) || c.accuracy < 0 || c.accuracy > 100 || !Number.isFinite(p.timestamp) || now() - p.timestamp > 30_000 || p.timestamp > now() + 5000) {
            show('Position imprécise ou ancienne. Attends une meilleure réception ; la livraison reste possible.'); return;
          }
          latest = { latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy, timestamp: p.timestamp };
          if (!lastSent) void transmit();
        }, error => {
          if (current === epoch) void stop(error.code === 1 ? 'Autorisation GPS refusée. Aucun blocage des livraisons.' : 'Signal GPS indisponible. Relance l’essai dehors, à l’arrêt.');
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
        if (current !== epoch) { if (watch !== null) geolocation.clearWatch(watch); watch = null; return; }
        timer = every(() => {
          if (now() >= Date.parse(opened.expiresAt)) void stop('Essai terminé après 30 minutes.');
          else if (!latest && now() - startedAt >= 60_000) void stop('Aucune position reçue. Réessaie dehors, à l’arrêt.');
          else void transmit();
        }, 10000);
      } catch {
        if (current === epoch) void stop('Impossible de démarrer le GPS. Les livraisons restent accessibles.');
      }
    }
    return { start, stop, snapshot: () => ({ ...state }) };
  }
  if (typeof module === 'object' && module.exports) module.exports = { createGpsPilot };
  else root.KrokliGps = { createGpsPilot };
})(typeof window !== 'undefined' ? window : globalThis);
