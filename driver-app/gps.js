(function (root) {
  'use strict';
  function createGpsPilot({ geolocation, send, onChange, onPosition = () => {}, now = Date.now, every = setInterval, cancelEvery = clearInterval }) {
    let epoch = 0, active = false, pending = false, watch = null, timer = null, session = null, latest = null, sending = false, lastSent = 0;
    let state = { active: false, pending: false, message: 'GPS facultatif · aucune position partagée.' };
    const show = message => { state = { active, pending, message }; onChange({ ...state }); };
    function clear() {
      active = pending = false;
      if (watch !== null) geolocation?.clearWatch(watch);
      if (timer !== null) cancelEvery(timer);
      watch = timer = latest = null;
    }
    async function stop(message = 'Partage GPS arrêté. Aucune nouvelle position partagée.') {
      epoch++; const old = session; session = null; clear(); show(message);
      if (old) { try { await send('stop', { sessionId: old.sessionId }); } catch { /* Server forgets the position within 90 seconds even offline. */ } }
    }
    async function transmit() {
      if (!active || sending || !session || !latest) return;
      if (now() - latest.timestamp > 30_000) { show('Signal GPS en attente. Le partage reprendra à la réception d’une position récente.'); return; }
      if (latest.timestamp <= lastSent) return;
      const current = epoch, p = latest, own = session;
      sending = true;
      try {
        const response = await send('position', { sessionId: own.sessionId, position: p });
        if (current !== epoch) return;
        lastSent = p.timestamp;
        show(`Position reçue par Bibou à ${new Date(response.receivedAt).toLocaleTimeString('fr-FR')} · précision ±${Math.ceil(p.accuracy)} m.`);
      } catch (error) {
        if (current === epoch) {
          if ([401,403,409].includes(error.status)) void stop('Session GPS fermée par le serveur. Reconnecte-toi ou réactive le partage à l’arrêt.');
          else show('Transmission interrompue. Le partage reste demandé ; nouvelle tentative avec une position récente.');
        }
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
        opened = await send('start', { consentVersion: 'bibou-foreground-gps-until-stop-v2' });
        if (current !== epoch) { await send('stop', { sessionId: opened.sessionId }).catch(() => {}); return; }
        if (opened.sharingMode !== 'until-stopped' || opened.expiresAt !== null || typeof opened.sessionId !== 'string' || !/^[A-Za-z0-9_-]{8,120}$/.test(opened.sessionId)) {
          if (opened.sessionId) await send('stop', { sessionId: opened.sessionId }).catch(() => {});
          throw Error('Version du partage GPS à actualiser.');
        }
        session = opened; lastSent = 0; pending = false; active = true;
        show('Autorise la localisation du téléphone. Recherche d’une position précise…');
        watch = geolocation.watchPosition(p => {
          if (current !== epoch || !active) return;
          const c = p.coords;
          if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude) || !Number.isFinite(c.accuracy) || c.accuracy < 0 || c.accuracy > 100 || !Number.isFinite(p.timestamp) || now() - p.timestamp > 30_000 || p.timestamp > now() + 5000) {
            show('Position imprécise ou ancienne. Attends une meilleure réception ; la livraison reste possible.'); return;
          }
          latest = { latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy, timestamp: p.timestamp };
          try { onPosition({ ...latest }); } catch { /* A map failure must not interrupt restaurant GPS sharing. */ }
          if (!lastSent) void transmit();
        }, error => {
          if (current === epoch) {
            if (error.code === 1) void stop('Autorisation GPS refusée ou retirée. Aucun blocage des livraisons.');
            else show('Signal GPS indisponible. Le partage reste demandé ; attends une meilleure réception.');
          }
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
        if (current !== epoch) { if (watch !== null) geolocation.clearWatch(watch); watch = null; return; }
        timer = every(() => {
          if (!latest && now() - startedAt >= 60_000) show('Aucune position reçue. Le partage reste demandé ; vérifie le GPS à l’arrêt.');
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
