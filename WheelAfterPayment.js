import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

const polar = (angle, radius = 105) => ({ x: 110 + radius * Math.cos((angle - 90) * Math.PI / 180), y: 110 + radius * Math.sin((angle - 90) * Math.PI / 180) });
const sector = (start, end) => {
  const first = polar(start), last = polar(end);
  return `M 110 110 L ${first.x} ${first.y} A 105 105 0 ${end - start > 180 ? 1 : 0} 1 ${last.x} ${last.y} Z`;
};
const colors = { none: '#E5C7B5', 'points-20': '#A8D3C4', 'points-30': '#A8D3C4', 'points-40': '#86BDA9', 'points-60': '#6AA58D', drink: '#C37559', fries: '#E7A87D', 'discount-1': '#668F80', 'discount-2': '#4F7D69', 'discount-5': '#315B4B' };
const label = id => id === 'none' ? '•' : id.startsWith('points') ? '★' : id === 'drink' ? '🥤' : id === 'fries' ? '🍟' : '%';

// The game is offered only by the web checkout, after the server has confirmed
// the payment. The server can keep it closed independently of a web release.
export default function WheelAfterPayment({ api, token, order }) {
  const [state, setState] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pendingId = useRef(null);
  const rotation = useRef(new Animated.Value(0)).current;
  const rotationDegrees = useRef(0);
  const orderTurns = state?.orderTurns?.find(item => item.orderId === order?.id);
  const turns = (orderTurns?.available || 0) + (state?.availableFromReferrals || 0);
  const segments = state?.segments?.[orderTurns?.tier || 'small'] || [];
  const activePrizes = (state?.prizes || []).filter(prize => prize.code && prize.redemptionStatus === 'active' && Date.parse(prize.expiresAt) > Date.now());
  const canSpin = state?.status === 'active' && turns > 0;

  useEffect(() => {
    setState(null);
    setResult(null);
    if (Platform.OS !== 'web' || !token || !order?.id || order?.payment?.status !== 'PAID' ||
      order?.payment?.provider === 'promotion' || order?.reviewMode) return;
    const controller = new AbortController();
    fetch(`${api}/customer/wheel`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(value => { if (!controller.signal.aborted) setState(value); })
      .catch(() => {});
    return () => controller.abort();
  }, [api, token, order?.id, order?.payment?.status, order?.payment?.provider, order?.reviewMode]);

  if (Platform.OS !== 'web' || (!canSpin && !activePrizes.length && !result)) return null;

  const spin = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    pendingId.current ||= `spin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const response = await fetch(`${api}/customer/wheel/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...(orderTurns?.available ? { orderId: order.id } : {}), requestId: pendingId.current }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Le tour est momentanément indisponible.');
      pendingId.current = null;
      let edge = 0;
      const matching = segments.map(([id, weight]) => {
        const center = edge + weight / 2;
        edge += weight;
        return { id, center };
      }).find(item => item.id === payload.spin.prizeId);
      const target = (360 - (matching?.center || 25) * 3.6) % 360;
      const delta = (target - rotationDegrees.current + 360) % 360;
      const end = rotationDegrees.current + 1800 + delta;
      Animated.timing(rotation, { toValue: end, duration: 2500, useNativeDriver: true }).start(() => {
        rotationDegrees.current = target;
        rotation.setValue(target);
        setResult(payload.spin);
        setState(payload.state);
        setBusy(false);
      });
    } catch (cause) { setError(cause.message || 'Réessaie dans un instant.'); setBusy(false); }
  };

  return <View style={styles.card}>
    <Text style={styles.eyebrow}>APRÈS TA COMMANDE</Text>
    <Text style={styles.title}>{canSpin ? 'Tourne la roue' : 'Tes gains de la roue'}</Text>
    {canSpin ? <><Text style={styles.description}>{turns} tour{turns > 1 ? 's' : ''} disponible{turns > 1 ? 's' : ''} grâce à ta commande payée ou à un parrainage validé.</Text>
      <View style={styles.wheelFrame}><Text style={styles.pointer}>▼</Text><Animated.View style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'], extrapolate: 'extend' }) }] }}><Svg width={220} height={220} viewBox="0 0 220 220">{segments.map(([id, weight], index) => {
        const start = segments.slice(0, index).reduce((sum, item) => sum + item[1], 0) * 3.6;
        const end = start + weight * 3.6;
        const point = polar((start + end) / 2, 74);
        return <G key={`${id}-${index}`}><Path d={sector(start, end)} fill={colors[id] || '#A8D3C4'} stroke="#FFF7EA" strokeWidth={2} />{weight >= 5 && <SvgText x={point.x} y={point.y + 5} textAnchor="middle" fill="#203E33" fontSize={weight >= 10 ? 20 : 13}>{label(id)}</SvgText>}</G>;
      })}<Circle cx={110} cy={110} r={39} fill="#FFF7EA" stroke="#315B4B" strokeWidth={5} /><SvgText x={110} y={116} textAnchor="middle" fill="#315B4B" fontSize={28}>✦</SvgText></Svg></Animated.View></View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={spin} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>{busy ? 'La roue tourne…' : 'Tourner la roue'}</Text></Pressable></> : null}
    {result ? <Text accessibilityLiveRegion="polite" style={styles.result}>{result.label}</Text> : null}
    {activePrizes.map(prize => <View key={prize.id} style={styles.prize}><Text style={styles.prizeLabel}>{prize.label}</Text><Text selectable style={styles.prizeCode}>{prize.code}</Text><Text style={styles.prizeHint}>À saisir comme code promo sur une prochaine commande.</Text></View>)}
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    <Text style={styles.rules}>{state.rules}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { width: '100%', padding: 18, borderRadius: 22, backgroundColor: '#D9EEE5', marginVertical: 14, alignItems: 'center' },
  eyebrow: { color: '#315B4B', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#203E33', fontSize: 26, fontWeight: '900', marginTop: 5 },
  description: { color: '#315B4B', fontSize: 15, textAlign: 'center', marginVertical: 8 },
  wheelFrame: { width: 220, height: 235, alignItems: 'center', marginVertical: 14 },
  pointer: { position: 'absolute', zIndex: 2, top: -16, color: '#315B4B', fontSize: 31 },
  button: { backgroundColor: '#315B4B', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 28 },
  buttonText: { color: '#FFF7EA', fontWeight: '900', fontSize: 17 },
  disabled: { opacity: .5 },
  result: { color: '#203E33', fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  error: { color: '#A63D29', marginTop: 12, textAlign: 'center' },
  rules: { color: '#315B4B', fontSize: 13, lineHeight: 19, textAlign: 'left', marginTop: 16 },
  prize: { backgroundColor: '#FFF7EA', borderRadius: 12, padding: 12, width: '100%', marginTop: 12, alignItems: 'center' },
  prizeLabel: { color: '#203E33', fontWeight: '800', textAlign: 'center' },
  prizeCode: { color: '#C37559', fontSize: 18, fontWeight: '900', marginTop: 6 },
  prizeHint: { color: '#315B4B', fontSize: 12, textAlign: 'center', marginTop: 5 },
});
