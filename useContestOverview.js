import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
export default function useContestOverview(apiBaseUrl, token = '') {
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => {
    let alive = true, busy = false, controller;
    const refresh = async () => {
      if (!alive || busy) return;
      busy = true;
      controller = new AbortController();
      const current = controller;
      const timer = setTimeout(() => current.abort(), 8000);
      try {
        const response = await fetch(apiBaseUrl + '/' + (token ? 'customer/contest' : 'contest') + '?contestApi=2', {
          cache: 'no-store', signal: current.signal, headers: token ? { Authorization: 'Bearer ' + token } : {},
        });
        if (!response.ok) throw new Error('Concours indisponible');
        const value = await response.json();
        if (alive) setSnapshot({ apiBaseUrl, token, data: token ? value : { contest: value } });
      } catch { if (alive) setSnapshot({ apiBaseUrl, token, data: null }); }
      finally { clearTimeout(timer); busy = false; }
    };
    void refresh();
    const interval = setInterval(refresh, 60000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const visible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') void refresh(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visible);
    return () => {
      alive = false; controller?.abort(); clearInterval(interval); subscription.remove();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visible);
    };
  }, [apiBaseUrl, token]);
  // Do not show the previous customer's rank during a session change.
  return snapshot?.apiBaseUrl === apiBaseUrl && snapshot?.token === token ? snapshot.data : null;
}
