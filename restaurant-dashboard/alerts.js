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

  const createSoundPlayer = ({ createContext, enabled = true, onChange = () => {} }) => {
    let context = null;
    let wanted = enabled;
    let nextAt = 0;
    let generation = 0;
    let failed = false;
    const nodes = new Set();
    const state = () => ({ enabled: wanted, supported: Boolean(createContext), ready: wanted && !failed && context?.state === "running" });
    const stop = () => {
      for (const { oscillator, gain } of nodes) {
        gain.gain.cancelScheduledValues(0);
        gain.gain.setValueAtTime(0, context.currentTime);
        try { oscillator.stop(); } catch { /* Already ended. */ }
      }
      nodes.clear();
      nextAt = 0;
    };
    const setEnabled = async (value) => {
      const request = ++generation;
      wanted = Boolean(value);
      if (!wanted) { stop(); onChange(state()); return false; }
      if (!createContext) { onChange(state()); return false; }
      failed = false;
      try {
        if (!context || context.state === "closed") {
          context = createContext();
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
          gain.gain.linearRampToValueAtTime(kind === "orders" ? 0.45 : 0.24, at + 0.02);
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
    return { state, setEnabled, play, stop };
  };
  return { createArrivalTracker, connectionStatus, createSoundPlayer };
});
