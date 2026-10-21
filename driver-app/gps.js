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
    async function start(consent,{customerTracking=false}={}) {
      if (active || pending) return;
      if (!consent) { show('Coche la case après avoir lu les informations du partage GPS.'); return; }
      if (!geolocation?.watchPosition) { show('GPS indisponible dans ce navigateur. Les livraisons restent accessibles.'); return; }
      const current = ++epoch, startedAt = now();
      pending = true; show('Préparation du partage GPS…');
      let opened;
      try {
        opened = await send('start', { consentVersion: customerTracking?'bibou-foreground-gps-customer-v3':'bibou-foreground-gps-until-stop-v2',...(customerTracking?{customerTracking:true}:{}) });
        if (current !== epoch) { await send('stop', { sessionId: opened.sessionId }).catch(() => {}); return; }
        if (customerTracking&&opened.customerTracking!==true||opened.sharingMode !== 'until-stopped' || opened.expiresAt !== null || typeof opened.sessionId !== 'string' || !/^[A-Za-z0-9_-]{8,120}$/.test(opened.sessionId)) {
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
            if (error.code === 1) void stop('Autorisation GPS refusée ou retirée. Dans les réglages du téléphone ou du navigateur, autorise la localisation pour Driver, puis réessaie à l’arrêt. Les livraisons restent accessibles.');
            else if (error.code === 2) show('Position introuvable. Vérifie que la localisation du téléphone est activée et garde Driver ouvert. Le partage reste demandé ; les livraisons restent accessibles.');
            else if (error.code === 3) show('La recherche GPS prend trop de temps. Garde Driver ouvert et attends une meilleure réception, à l’arrêt. Le partage reste demandé.');
            else show('Signal GPS indisponible. Le partage reste demandé ; attends une meilleure réception.');
          }
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
        if (current !== epoch) { if (watch !== null) geolocation.clearWatch(watch); watch = null; return; }
        timer = every(() => {
          if (!latest && now() - startedAt >= 60_000) show('Aucune position reçue. Le partage reste demandé ; vérifie le GPS à l’arrêt.');
          else void transmit();
        }, 10000);
      } catch (error) {
        if (current !== epoch) return;
        let reason = 'Impossible de démarrer le GPS. Actualise Driver puis réessaie à l’arrêt.';
        if (error.status === 401 || error.status === 403) reason = 'La connexion ne permet plus le partage GPS. Déconnecte-toi puis reconnecte-toi à ton compte livreur.';
        else if (error.status === 400 || error.status === 409 || error.message === 'Version du partage GPS à actualiser.') reason = 'Le partage GPS doit être actualisé. Ferme puis rouvre Driver avant de réessayer.';
        else if (error.status === 429) reason = 'Trop de demandes GPS rapprochées. Attends une minute puis réessaie à l’arrêt.';
        else if (error.status >= 500) reason = 'Le serveur de partage GPS est momentanément indisponible. Réessaie dans quelques instants.';
        else if (error.name === 'SecurityError' || error.name === 'NotAllowedError') reason = 'La localisation est bloquée par le téléphone ou le navigateur. Autorise-la pour Driver dans les réglages, puis réessaie à l’arrêt.';
        else if (error.name === 'AbortError' || error.name === 'TimeoutError') reason = 'Le serveur GPS ne répond pas à temps. Vérifie la connexion Internet puis réessaie.';
        else if (error instanceof TypeError) reason = 'Connexion au serveur GPS impossible. Vérifie Internet puis réessaie.';
        await stop(`${reason} Les livraisons restent accessibles.`);
      }
    }
    return { start, stop, snapshot: () => ({ ...state }) };
  }
  if (typeof module === 'object' && module.exports) module.exports = { createGpsPilot };
  else root.KrokliGps = { createGpsPilot };
})(typeof window !== 'undefined' ? window : globalThis);
