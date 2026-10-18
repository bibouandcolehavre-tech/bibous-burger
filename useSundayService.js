import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
const { isSundayService } = require('./sunday-service-policy');
const { observeBrowserFocus } = require('./browser-focus');

// Update on returning to the app, and across midnight even if it stays open.
export default function useSundayService() {
  const [sunday, setSunday] = useState(() => isSundayService());
  useEffect(() => {
    const refresh = () => setSunday(isSundayService());
    refresh();
    const timer = setInterval(refresh, 30000);
    const stopFocus = observeBrowserFocus(Platform.OS, refresh);
    const state = Platform.OS === 'web' ? null : AppState.addEventListener('change', value => {
      if (value === 'active') refresh();
    });
    return () => { clearInterval(timer); stopFocus(); state?.remove(); };
  }, []);
  return sunday;
}
