(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BibouAlerts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const isActionable = (kind, item) => kind === "orders"
    ? item.status === "confirmed" && item.payment?.status === "PAID"
    : kind === "reservations" ? item.status === "pending" : item.status === "active";

  // First successful snapshot is silent, even if it is empty. Failed requests must
  // never be passed here. Remember arrivals through temporary empty snapshots.
  const createArrivalTracker = () => {
    const feeds = new Map();
    return {
      update(kind, items) {
        if (!Array.isArray(items)) throw new Error("Liste de demandes invalide.");
        const previous = feeds.get(kind);
        const seen = previous || new Set();
        const fresh = [];
        for (const item of items) {
          if (!item?.id || !isActionable(kind, item)) continue;
          if (previous && !seen.has(item.id)) fresh.push(item);
          seen.add(item.id);
        }
        feeds.set(kind, seen);
        return fresh;
      }
    };
  };

  const connectionStatus = (feeds, online, now = Date.now()) => {
    if (!online) return { warning: true, text: "Hors ligne — les nouvelles demandes ne peuvent pas arriver." };
    if (feeds.some((feed) => feed.error || (feed.lastSuccess && now - feed.lastSuccess > 45000))) return { warning: true, text: "Actualisation interrompue — vérifiez la connexion. Nouvelle tentative automatique." };
    if (feeds.some((feed) => !feed.lastSuccess)) return { warning: false, text: "Connexion au restaurant…" };
    const oldest = Math.min(...feeds.map((feed) => feed.lastSuccess));
    return { warning: false, text: `À jour à ${new Date(oldest).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · vérification toutes les 10 s` };
  };

  // An audio-clock loop keeps ringing even when background tabs throttle JS timers.
  const createAlarmSamples = (sampleRate, seconds = 8) => {
    const samples = new Float32Array(Math.round(sampleRate * seconds));
    [740, 988, 1244, 740, 988, 1244, 740, 988, 1244].forEach((frequency, index) => {
      const start = index * 0.38 + Math.floor(index / 3) * 0.38;
      for (let i = 0; i < sampleRate * 0.32; i++) {
        const time = i / sampleRate, at = Math.round(start * sampleRate) + i;
        if (at >= samples.length) break;
        const envelope = Math.min(1, time / 0.015, (0.32 - time) / 0.065);
        samples[at] = 0.65 * envelope * (Math.sin(2 * Math.PI * frequency * time) + 0.28 * Math.sin(4 * Math.PI * frequency * time));
      }
    });
    return samples;
  };

  const createSoundPlayer = ({ createContext, volume = 1, onChange = () => {} }) => {
    let context = null;
    let nextAt = 0;
    let generation = 0;
    let failed = false;
    let level = Math.min(1, Math.max(0.1, Number(volume) || 1));
    let alarmNode = null, testNode = null, alarmBuffer = null;
    const nodes = new Set();
    const state = () => ({ volume: level, supported: Boolean(createContext), ready: !failed && context?.state === "running", ringing: Boolean(alarmNode) });
    const stopBuffer = entry => { if (!entry) return; try { entry.source.stop(); } catch {} entry.source.disconnect(); entry.gain.disconnect(); };
    const stopAlarm = () => { const previous = alarmNode; alarmNode = null; stopBuffer(previous); };
    const stop = () => {
      stopAlarm(); stopBuffer(testNode); testNode = null;
      for (const { oscillator, gain } of nodes) {
        gain.gain.cancelScheduledValues(0);
        gain.gain.setValueAtTime(0, context.currentTime);
        try { oscillator.stop(); } catch { /* Already ended. */ }
      }
      nodes.clear();
      nextAt = 0;
    };
    const activate = async () => {
      const request = ++generation;
      if (!createContext) { onChange(state()); return false; }
      failed = false;
      try {
        if (!context || context.state === "closed") {
          context = createContext();
          alarmBuffer = null;
          context.onstatechange = () => { if (context.state !== "running") stop(); onChange(state()); };
        }
        if (context.state !== "running") {
          let timeout;
          try {
            await Promise.race([context.resume(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Audio bloqué")), 2000); })]);
          } finally { clearTimeout(timeout); }
        }
      } catch { failed = true; onChange(state()); return false; }
      if (request !== generation) return false;
      onChange(state());
      return state().ready;
    };
    const play = (kind = "orders") => {
      if (!state().ready) return false;
      try {
        const frequencies = kind === "reservations" ? [523.25, 659.25] : kind === "rewards" ? [659.25, 783.99] : [659.25, 783.99, 1046.5, 659.25, 783.99, 1046.5, 659.25, 783.99, 1046.5];
        const start = Math.max(context.currentTime + 0.03, nextAt);
        frequencies.forEach((frequency, index) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const orderPause = kind === "orders" ? Math.floor(index / 3) * 0.48 : 0;
          const at = start + index * 0.3 + orderPause;
          oscillator.type = kind === "orders" ? "triangle" : "sine";
          oscillator.frequency.setValueAtTime(frequency, at);
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime((kind === "orders" ? 0.45 : 0.24) * level, at + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, at + (kind === "orders" ? 0.27 : 0.22));
          oscillator.connect(gain);
          gain.connect(context.destination);
          const entry = { oscillator, gain };
          nodes.add(entry);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); nodes.delete(entry); };
          oscillator.start(at);
          oscillator.stop(at + (kind === "orders" ? 0.29 : 0.24));
        });
        nextAt = start + (kind === "orders" ? 3.7 : frequencies.length * 0.25 + 0.15);
        return true;
      } catch { failed = true; stop(); onChange(state()); return false; }
    };
    const startBuffer = loop => {
      if (!state().ready) return false;
      if (alarmNode) return true;
      stopBuffer(testNode); testNode = null;
      try {
        if (!alarmBuffer) {
          alarmBuffer = context.createBuffer(1, Math.round(context.sampleRate * 8), context.sampleRate);
          alarmBuffer.getChannelData(0).set(createAlarmSamples(context.sampleRate));
        }
        const source = context.createBufferSource(), gain = context.createGain();
        source.buffer = alarmBuffer; source.loop = loop;
        gain.gain.setValueAtTime(level, context.currentTime);
        source.connect(gain); gain.connect(context.destination);
        const entry = { source, gain };
        source.onended = () => { source.disconnect(); gain.disconnect(); if (testNode === entry) testNode = null; };
        source.start();
        if (loop) alarmNode = entry; else testNode = entry;
        return true;
      } catch { failed = true; stop(); onChange(state()); return false; }
    };
    const setVolume = value => { if (!Number.isFinite(Number(value))) return; level = Math.min(1, Math.max(0.1, Number(value))); for (const entry of [alarmNode, testNode]) entry?.gain.gain.setValueAtTime(level, context.currentTime); onChange(state()); };
    return { state, activate, play, stop, startAlarm: () => startBuffer(true), stopAlarm, test: () => startBuffer(false), setVolume };
  };

  const createOrderAlarm = ({ player, onChange = () => {} }) => {
    let pending = new Map();
    const state = () => ({ count: pending.size, numbers: [...pending.values()].map(item => item.number).filter(Number.isFinite), ringing: player.state().ringing, ready: player.state().ready });
    const refresh = () => {
      if (pending.size && player.state().ready) player.startAlarm();
      else player.stopAlarm();
      onChange(state());
    };
    return {
      state, refresh,
      sync(items) {
        const next = new Map(items.filter(item => item?.id && isActionable('orders', item)).map(item => [item.id, item]));
        pending = next; refresh();
      },
      resolve(id) { pending.delete(id); refresh(); },
      reset() { pending.clear(); player.stopAlarm(); onChange(state()); }
    };
  };
  return { createArrivalTracker, connectionStatus, createSoundPlayer, createOrderAlarm, createAlarmSamples };
});
