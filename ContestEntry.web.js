import { useEffect, useState } from 'react';
const { contestEntry } = require('./contest-entry');

export default function ContestEntry({ apiBaseUrl, onOpenContest }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true, busy = false, current = null;
    const refresh = async () => {
      if (!alive || busy) return;
      busy = true;
      const controller = new AbortController(); current = controller;
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`${apiBaseUrl}/contest?contestApi=2`, { cache: 'no-store', signal: controller.signal });
        const next = response.ok ? await response.json() : null;
        if (alive) setData(next);
      } catch { if (alive) setData(null); }
      finally { clearTimeout(timeout); busy = false; }
    };
    void refresh();
    const interval = setInterval(refresh, 60000);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { alive = false; current?.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', visible); };
  }, [apiBaseUrl]);
  const entry = contestEntry(data);
  if (!entry) return null;
  return <section aria-label="Le concours Bibou" data-bibou="contest-entry" style={{ width: '100%', maxWidth: 440, alignSelf: 'center', margin: '8px auto 12px', boxSizing: 'border-box', padding: '14px 16px', border: '1px solid #B7C9A1', borderRadius: 18, background: '#FFF0C9', color: '#25473B', textAlign: 'center', fontFamily: 'system-ui,sans-serif' }}>
    <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>{entry.eyebrow}</p>
    <h2 style={{ margin: '5px 0', fontSize: 20, lineHeight: 1.2, fontWeight: 850 }}>{entry.title}</h2>
    <p style={{ margin: '5px 0 10px', fontSize: 12, lineHeight: 1.45 }}>{entry.detail}</p>
    <button type="button" onClick={onOpenContest} style={{ display: 'block', width: '100%', minHeight: 48, boxSizing: 'border-box', padding: '11px 14px', border: 0, borderRadius: 12, background: '#315B4B', color: '#FFF9EF', font: '800 16px system-ui,sans-serif', cursor: 'pointer' }}>{entry.action}</button>
  </section>;
}
