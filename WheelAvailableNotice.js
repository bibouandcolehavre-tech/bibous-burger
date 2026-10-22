import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text } from 'react-native';
const { wheelPresentation } = require('./wheel-presentation');

// Read-only shortcut outside Mon compte. Never spins, credits or estimates a
// reward, and never interrupts checkout, payment or the confirmation screen.
export default function WheelAvailableNotice({ api, token, enabled, onOpen }) {
  const [available, setAvailable] = useState(0);
  useEffect(() => {
    setAvailable(0);
    if (!enabled || !token) return;
    let stopped = false, controller = null;
    const refresh = async () => {
      if (stopped || controller || ['background', 'inactive'].includes(AppState.currentState)) return;
      controller = new AbortController();
      const current = controller;
      const timer = setTimeout(() => current.abort(), 12000);
      try {
        const response = await fetch(`${api}/customer/wheel`, { headers: { Authorization: `Bearer ${token}` }, signal: current.signal, cache: 'no-store' });
        if (!response.ok) throw Error('Roue indisponible');
        const state = await response.json();
        const view = wheelPresentation(state, null, true);
        if (!stopped) setAvailable(state.status === 'active' && view.canRequest ? view.available : 0);
      } catch { if (!stopped) setAvailable(0); }
      finally { clearTimeout(timer); if (controller === current) controller = null; }
    };
    void refresh();
    const foreground = AppState.addEventListener('change', value => { if (value === 'active') void refresh(); });
    const timer = setInterval(refresh, 30000);
    return () => { stopped = true; clearInterval(timer); foreground.remove(); controller?.abort(); };
  }, [api, token, enabled]);
  if (!enabled || !available) return null;
  return <Pressable testID="wheel-direct-shortcut" accessibilityRole="button" accessibilityLabel={`Tu as ${available} tour${available > 1 ? 's' : ''} de roue. Jouer maintenant`} onPress={onOpen} style={styles.notice}>
    <Text style={styles.text}>🎁 {available} tour{available > 1 ? 's' : ''} de roue · Jouer maintenant →</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  notice: { position: 'absolute', bottom: 104, left: 18, right: 18, alignSelf: 'center', maxWidth: 600, minHeight: 52, borderRadius: 16, backgroundColor: '#315B4B', borderColor: '#E9C569', borderWidth: 2, padding: 13, justifyContent: 'center', zIndex: 5 },
  text: { color: '#FFF7EA', fontSize: 15, lineHeight: 22, textAlign: 'center', fontWeight: '800' },
});
