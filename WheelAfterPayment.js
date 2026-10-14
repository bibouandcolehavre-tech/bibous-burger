import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
const { supportsNewCustomerJourneys } = require('./customer-experience-policy');
const { fullWheelRules } = require('./wheel-rules-client');

const polar = (angle, radius = 105) => ({ x: 110 + radius * Math.cos((angle - 90) * Math.PI / 180), y: 110 + radius * Math.sin((angle - 90) * Math.PI / 180) });
const sector = (start, end) => {
  const first = polar(start), last = polar(end);
  return `M 110 110 L ${first.x} ${first.y} A 105 105 0 ${end - start > 180 ? 1 : 0} 1 ${last.x} ${last.y} Z`;
};
const colors = { none: '#E5C7B5', 'points-20': '#A8D3C4', 'points-30': '#A8D3C4', 'points-40': '#86BDA9', 'points-60': '#6AA58D', drink: '#C37559', fries: '#E7A87D', 'discount-1': '#668F80', 'discount-2': '#4F7D69', 'discount-5': '#315B4B' };
const label = id => id === 'none' ? '•' : id.startsWith('points') ? '★' : id === 'drink' ? '🥤' : id === 'fries' ? '🍟' : '%';

function WheelRules({ rules, open, onOpen, onClose }) {
  if (!rules) return null;
  return <>
    <Pressable accessibilityRole="button" onPress={onOpen} style={styles.rulesLink}><Text style={styles.rulesLinkText}>Voir les règles de la roue ›</Text></Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.rulesBackdrop}>
        <View style={styles.rulesDialog}>
          <View style={styles.rulesHeader}><Text style={styles.rulesTitle}>Règles de la roue Bibou</Text><Pressable accessibilityRole="button" accessibilityLabel="Fermer les règles" onPress={onClose} style={styles.rulesClose}><Text style={styles.rulesCloseText}>✕</Text></Pressable></View>
          <ScrollView style={styles.rulesScroll} contentContainerStyle={styles.rulesContent}><Text style={styles.rulesText}>{rules}</Text></ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

// The game is offered after the server has confirmed payment. The server can
// keep it closed independently of a web or Android release.
export default function WheelAfterPayment({ api, token, order, accountMode = false, hidePrizes = false, onUpdate }) {
  const [state, setState] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const pendingId = useRef(null);
  const rotation = useRef(new Animated.Value(0)).current;
  const rotationDegrees = useRef(0);
  const checkoutEligible = supportsNewCustomerJourneys(Platform.OS) && !!token && !!order?.id && order?.payment?.status === 'PAID' &&
    !order?.reviewMode && (order?.payment?.provider !== 'promotion' || order?.promotion?.code === 'CHORUS');
  // A new CHORUS checkout must still show an unused test turn earned on an
  // earlier CHORUS order; it must not create another turn for the same account.
  const orderTurns = order?.id
    ? state?.orderTurns?.find(item => item.orderId === order.id) || state?.orderTurns?.[0]
    : state?.orderTurns?.[0];
  const turns = Math.min(state?.available || 0, (orderTurns?.available || 0) + (state?.availableFromReferrals || 0));
  const segments = state?.segments?.[orderTurns?.tier || 'small'] || [];
  const activePrizes = (state?.prizes || []).filter(prize => prize.code && prize.redemptionStatus === 'active' && Date.parse(prize.expiresAt) > Date.now());
  const canSpin = state?.status === 'active' && turns > 0;
  const chorusCheckout = !accountMode && order?.promotion?.code === 'CHORUS';

  useEffect(() => {
    setState(null);
    setResult(null);
    setLoadError(false);
    if (!supportsNewCustomerJourneys(Platform.OS) || !token || (!accountMode && !checkoutEligible)) return;
    const controller = new AbortController();
    let active = true;
    fetch(`${api}/customer/wheel`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error('Roue indisponible'); return response.json(); })
      .then(value => { if (active) setState(value); })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; controller.abort(); };
  }, [api, token, accountMode, checkoutEligible, order?.id, reload]);

  if (!supportsNewCustomerJourneys(Platform.OS) || (!accountMode && !checkoutEligible)) return null;
  if (!state) return <View style={styles.card}>
    <Text style={styles.eyebrow}>{accountMode ? 'CLUB BIBOU' : 'APRÈS TA COMMANDE'}</Text>
    <Text style={styles.title}>{loadError ? 'Tes tours sont à retrouver' : 'Vérification de tes tours…'}</Text>
    <Text style={styles.description}>{loadError ? 'Ta commande est bien confirmée. La roue ne s’affiche pas pour le moment ; tu peux réessayer sans refaire de commande.' : 'Nous vérifions si un tour de roue est disponible pour toi.'}</Text>
    {loadError && <Pressable accessibilityRole="button" onPress={() => setReload(value => value + 1)} style={styles.button}><Text style={styles.buttonText}>Réessayer d’afficher la roue</Text></Pressable>}
  </View>;
  // A CHORUS checkout must never silently hide the game: explain when the
  // limited test turns have already been played instead of looking broken.
  if (!canSpin && (hidePrizes || !activePrizes.length) && !result && !chorusCheckout) {
    return accountMode && state.rules ? <View style={styles.rulesOnlyCard}><Text style={styles.rulesOnlyText}>La roue Bibou : un jeu distinct du concours de classement.</Text><WheelRules rules={fullWheelRules(state.rules, state.segments)} open={rulesOpen} onOpen={() => setRulesOpen(true)} onClose={() => setRulesOpen(false)} /></View> : null;
  }

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
        body: JSON.stringify({ ...(orderTurns?.available ? { orderId: orderTurns.orderId } : {}), requestId: pendingId.current }),
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
        onUpdate?.(payload.state);
        setBusy(false);
      });
    } catch (cause) { setError(cause.message || 'Réessaie dans un instant.'); setBusy(false); }
  };

  return <View style={styles.card}>
    <Text style={styles.eyebrow}>{accountMode ? 'CLUB BIBOU' : 'TA COMMANDE EST CONFIRMÉE'}</Text>
    <Text style={styles.title}>{canSpin ? accountMode ? 'Tourne la roue' : 'Ton tour de roue est prêt !' : chorusCheckout ? 'Ton essai CHORUS est terminé' : 'Tes gains de la roue'}</Text>
    {chorusCheckout && !canSpin ? <Text style={styles.description}>{state.status === 'active' ? 'Les deux tours d’essai CHORUS de ce compte ont déjà été joués. Tes gains restent dans Mon compte → Mes offres ; aucune nouvelle commande n’est nécessaire.' : 'La roue n’est pas ouverte actuellement. Ta commande reste confirmée.'}</Text> : null}
    {canSpin ? <><Text style={styles.description}>{order?.promotion?.code === 'CHORUS' && orderTurns?.available ? orderTurns.orderId === order.id ? 'Un tour de test offert avec cette commande CHORUS, dans la limite de deux tours par compte.' : 'Un tour gagné sur une commande précédente est encore disponible ici, sans nouvelle commande.' : `${turns} tour${turns > 1 ? 's' : ''} disponible${turns > 1 ? 's' : ''} grâce à une commande ou à un parrainage validé.`}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={spin} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>{busy ? 'La roue tourne…' : 'Tourner la roue maintenant'}</Text></Pressable>
      <View style={styles.wheelFrame}><Text style={styles.pointer}>▼</Text><Animated.View style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'], extrapolate: 'extend' }) }] }}><Svg width={220} height={220} viewBox="0 0 220 220">{segments.map(([id, weight], index) => {
        const start = segments.slice(0, index).reduce((sum, item) => sum + item[1], 0) * 3.6;
        const end = start + weight * 3.6;
        const point = polar((start + end) / 2, 74);
        return <G key={`${id}-${index}`}><Path d={sector(start, end)} fill={colors[id] || '#A8D3C4'} stroke="#FFF7EA" strokeWidth={2} />{weight >= 5 && <SvgText x={point.x} y={point.y + 5} textAnchor="middle" fill="#203E33" fontSize={weight >= 10 ? 20 : 13}>{label(id)}</SvgText>}</G>;
      })}<Circle cx={110} cy={110} r={39} fill="#FFF7EA" stroke="#315B4B" strokeWidth={5} /><SvgText x={110} y={116} textAnchor="middle" fill="#315B4B" fontSize={28}>✦</SvgText></Svg></Animated.View></View></> : null}
    {result ? <Text accessibilityLiveRegion="polite" style={styles.result}>{result.label}</Text> : null}
    {!hidePrizes && activePrizes.map(prize => <View key={prize.id} style={styles.prize}><Text style={styles.prizeLabel}>{prize.label}</Text><Text selectable style={styles.prizeCode}>{prize.code}</Text><Text style={styles.prizeHint}>À saisir sur une prochaine commande d’au moins 10 € de produits, avant le {new Date(prize.expiresAt).toLocaleDateString('fr-FR')}. Usage unique et non cumulable avec un autre code. Si tu as gagné une boisson ou des frites, ajoute-les au panier. Retrouve ce code dans Mon compte → Mes offres.</Text></View>)}
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    <WheelRules rules={fullWheelRules(state.rules, state.segments)} open={rulesOpen} onOpen={() => setRulesOpen(true)} onClose={() => setRulesOpen(false)} />
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
  rulesOnlyCard: { width: '100%', padding: 16, borderRadius: 18, backgroundColor: '#D9EEE5', marginVertical: 14, alignItems: 'center' },
  rulesOnlyText: { color: '#315B4B', fontSize: 14, textAlign: 'center' },
  rulesLink: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 12 },
  rulesLinkText: { color: '#315B4B', fontSize: 15, fontWeight: '800', textDecorationLine: 'underline', textAlign: 'center' },
  rulesBackdrop: { flex: 1, backgroundColor: 'rgba(19, 39, 31, 0.72)', justifyContent: 'center', padding: 18 },
  rulesDialog: { width: '100%', maxWidth: 640, maxHeight: '84%', alignSelf: 'center', backgroundColor: '#FFF9EF', borderRadius: 20, padding: 20 },
  rulesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  rulesTitle: { color: '#203E33', fontSize: 22, fontWeight: '900', flexShrink: 1 },
  rulesClose: { padding: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  rulesCloseText: { color: '#315B4B', fontSize: 23, fontWeight: '800' },
  rulesScroll: { flexShrink: 1 },
  rulesContent: { paddingBottom: 12 },
  rulesText: { color: '#315B4B', fontSize: 15, lineHeight: 23 },
  prize: { backgroundColor: '#FFF7EA', borderRadius: 12, padding: 12, width: '100%', marginTop: 12, alignItems: 'center' },
  prizeLabel: { color: '#203E33', fontWeight: '800', textAlign: 'center' },
  prizeCode: { color: '#C37559', fontSize: 18, fontWeight: '900', marginTop: 6 },
  prizeHint: { color: '#315B4B', fontSize: 12, textAlign: 'center', marginTop: 5 },
});
