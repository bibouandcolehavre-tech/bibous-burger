import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
const { supportsNewCustomerJourneys } = require('./customer-experience-policy');
const { fullWheelRules } = require('./wheel-rules-client');
const { isReviewToken } = require('./review-client');
const { wheelPresentation, wheelDiameter, wheelPrizeHint } = require('./wheel-presentation');

const polar = (angle, radius = 105) => ({ x: 110 + radius * Math.cos((angle - 90) * Math.PI / 180), y: 110 + radius * Math.sin((angle - 90) * Math.PI / 180) });
const sector = (start, end) => {
  const first = polar(start), last = polar(end);
  return `M 110 110 L ${first.x} ${first.y} A 105 105 0 ${end - start > 180 ? 1 : 0} 1 ${last.x} ${last.y} Z`;
};
const colors = { none: '#E5C7B5', 'points-20': '#A8D3C4', 'points-30': '#A8D3C4', 'points-40': '#86BDA9', 'points-60': '#6AA58D', drink: '#C37559', fries: '#E7A87D', dessert: '#D7A77D', classic: '#E9C569', 'discount-1': '#668F80', 'discount-2': '#4F7D69', 'discount-5': '#315B4B' };
const label = id => id === 'none' ? '•' : id.startsWith('points') ? '★' : id === 'drink' ? '🥤' : id === 'fries' ? '🍟' : id === 'dessert' ? '🍰' : id === 'classic' ? '🍔' : id === 'stb-tickets' ? 'STB' : '%';

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
  const [cardWidth, setCardWidth] = useState(0);
  const [resultSegments, setResultSegments] = useState(null);
  const { width: screenWidth } = useWindowDimensions();
  const working = useRef(false);
  const epoch = useRef(0);
  const spinController = useRef(null);
  const pendingId = useRef(null);
  const rotation = useRef(new Animated.Value(0)).current;
  const rotationDegrees = useRef(0);
  const checkoutEligible = supportsNewCustomerJourneys(Platform.OS) && !!token && !!order?.id && order?.payment?.status === 'PAID' &&
    (!order?.reviewMode || isReviewToken(token)) && order?.payment?.provider !== 'promotion';
  const presentation = wheelPresentation(state, order, accountMode);
  const orderTurns = presentation.source;
  const turns = presentation.available;
  const diameter = wheelDiameter(cardWidth || Math.max(0, screenWidth - 56));
  const ticketEligible = !orderTurns || orderTurns.stbEligible !== false;
  const segments = (ticketEligible ? state?.segments : state?.baseSegments || state?.segments)?.[orderTurns?.tier || 'small'] || [];
  const activePrizes = (state?.prizes || []).filter(prize => prize.code && prize.redemptionStatus === 'active' && Date.parse(prize.expiresAt) > Date.now());
  const canSpin = state?.status === 'active' && presentation.canRequest && segments.length > 0;

  useEffect(() => {
    const generation = ++epoch.current;
    setState(null);
    setResult(null);
    setResultSegments(null);
    setBusy(false);
    working.current = false;
    pendingId.current = null;
    setLoadError(false);
    if (!supportsNewCustomerJourneys(Platform.OS) || !token || (!accountMode && !checkoutEligible)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let active = true;
    fetch(`${api}/customer/wheel`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error('Roue indisponible'); return response.json(); })
      .then(value => { if (active && epoch.current === generation) setState(value); })
      .catch(() => { if (active && epoch.current === generation) setLoadError(true); })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false; epoch.current++; clearTimeout(timer); controller.abort();
      spinController.current?.abort(); rotation.stopAnimation();
    };
  }, [api, token, accountMode, checkoutEligible, order?.id, reload]);

  if (!supportsNewCustomerJourneys(Platform.OS) || (!accountMode && !checkoutEligible)) return null;
  if (!state) return <View style={styles.card}>
    <Text style={styles.eyebrow}>{accountMode ? 'CLUB BIBOU' : 'APRÈS TA COMMANDE'}</Text>
    <Text style={styles.title}>{loadError ? 'Tes tours sont à retrouver' : 'Vérification de tes tours…'}</Text>
    <Text style={styles.description}>{loadError ? 'Ta commande est bien confirmée. La roue ne s’affiche pas pour le moment ; tu peux réessayer sans refaire de commande.' : 'Nous vérifions si un tour de roue est disponible pour toi.'}</Text>
    {loadError && <Pressable accessibilityRole="button" onPress={() => setReload(value => value + 1)} style={styles.button}><Text style={styles.buttonText}>Réessayer d’afficher la roue</Text></Pressable>}
  </View>;
  if (!canSpin && !turns && (hidePrizes || !activePrizes.length) && !result) {
    return accountMode && state.rules ? <View style={styles.rulesOnlyCard}><Text style={styles.rulesOnlyText}>La roue Bibou : un jeu distinct du concours de classement.</Text><WheelRules rules={fullWheelRules(state.rules, state.segments)} open={rulesOpen} onOpen={() => setRulesOpen(true)} onClose={() => setRulesOpen(false)} /></View> : null;
  }

  const spin = async () => {
    if (busy || working.current || !canSpin) return;
    working.current = true;
    const generation = epoch.current;
    const controller = new AbortController();
    spinController.current = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    setBusy(true);
    setError('');
    setResult(null);
    // Keep both id and source on an ambiguous network failure. A retry must
    // retrieve that same server result, not spend a second turn.
    pendingId.current ||= { requestId: `spin-${Date.now()}-${Math.random().toString(36).slice(2)}`, ...(orderTurns?.available ? { orderId: orderTurns.orderId } : {}) };
    try {
      const response = await fetch(`${api}/customer/wheel/spin`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(pendingId.current),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Le tour est momentanément indisponible.');
      if (epoch.current !== generation) return;
      if (!payload.spin || !payload.state) throw new Error('Le résultat doit être vérifié. Réessaie sans repasser commande.');
      clearTimeout(timer);
      pendingId.current = null;
      const actualSegments = Array.isArray(payload.spin.rewardSegments) ? payload.spin.rewardSegments : segments;
      setResultSegments(actualSegments);
      let edge = 0;
      const matching = actualSegments.map(([id, weight]) => {
        const center = edge + weight / 2;
        edge += weight;
        return { id, center };
      }).find(item => item.id === payload.spin.prizeId);
      const target = (360 - (matching?.center || 25) * 3.6) % 360;
      const delta = (target - rotationDegrees.current + 360) % 360;
      const end = rotationDegrees.current + 1800 + delta;
      Animated.timing(rotation, { toValue: end, duration: 2500, useNativeDriver: true }).start(() => {
        if (epoch.current !== generation) return;
        rotationDegrees.current = target;
        rotation.setValue(target);
        setResult(payload.spin);
        setState(payload.state);
        onUpdate?.(payload.state);
        working.current = false;
        setBusy(false);
      });
    } catch (cause) {
      if (epoch.current !== generation) return;
      setError(cause.name === 'AbortError' ? 'La réponse tarde. Réessaie : le même tour sera vérifié, sans en dépenser un autre.' : cause.message || 'Réessaie dans un instant.');
      working.current = false; setBusy(false);
    } finally { clearTimeout(timer); }
  };

  const visibleSegments = result && resultSegments ? resultSegments : segments;
  return <View style={styles.card} onLayout={event => setCardWidth(event.nativeEvent.layout.width)}>
    <Text style={styles.eyebrow}>{accountMode ? 'CLUB BIBOU' : 'TA COMMANDE EST CONFIRMÉE'}</Text>
    <Text style={styles.title}>{turns ? 'Tes tours de roue' : result ? 'Merci d’avoir joué !' : 'Tes gains de la roue'}</Text>
    {!!presentation.orderUnlockedText && <Text style={styles.orderNotice}>{presentation.orderUnlockedText}</Text>}
    {(turns > 0 || result) && <View testID="wheel-remaining-counter" accessibilityLiveRegion="polite" style={styles.counter}>
      <Text style={styles.counterText}>{presentation.remainingText}</Text>
      {turns === 0 && <Text style={styles.counterHint}>{presentation.completedText}</Text>}
    </View>}
    {turns > 0 && <Text style={styles.description}>Chaque tour joué est décompté automatiquement.{presentation.fromReferrals > 0 ? ` Dont ${presentation.fromReferrals} grâce à tes parrainages validés.` : ''}</Text>}
    {!accountMode && presentation.orderUnlockedText && turns > 0 && presentation.currentOrderRemaining !== turns && <Text style={styles.prizeHint}>Pour cette commande : {presentation.currentOrderRemaining} tour{presentation.currentOrderRemaining === 1 ? '' : 's'} restant{presentation.currentOrderRemaining === 1 ? '' : 's'}. Tes tours précédents sont aussi inclus dans le total.</Text>}
    {turns > 0 && !canSpin && <Text style={styles.description}>La roue n’est pas disponible pour le moment. Tes tours affichés ne sont pas joués.</Text>}
    {state.rewardsVersion === 2 && <Text style={styles.oddsNotice}>À chaque tour : 80 % de chances de gagner · 20 % sans gain.</Text>}
    {ticketEligible && state.stbTickets?.nextPrize && <Text style={styles.description}>🏀 Un lot de deux places STB contre {state.stbTickets.nextPrize.opponent} · match du {new Date(state.stbTickets.nextPrize.matchAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}. Un seul gagnant, 1 % de chance par tour éligible, puis tirage de rattrapage si nécessaire. Attribution au moins cinq jours avant le match. Les tours fictifs ne participent pas.</Text>}
    {state.stbTickets?.awards?.map(prize => <View key={prize.id} style={styles.prize}><Text style={styles.prizeLabel}>🏀 Tes deux places STB · {prize.opponent}</Text><Text style={styles.prizeHint}>Match du {new Date(prize.matchAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} · {prize.fulfillment === 'delivered' ? 'Places remises par le restaurant.' : 'Contacte le restaurant pour récupérer les deux places.'}</Text><Text selectable style={styles.prizeCode}>{prize.claimCode}</Text></View>)}
    {canSpin ? <>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={spin} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>{busy ? 'La roue tourne…' : 'Tourner la roue maintenant'}</Text></Pressable>
      </> : null}
      {(canSpin || result) && <View testID="wheel-large-display" style={[styles.wheelFrame, { width: diameter, height: diameter + 18 }]}><Text style={styles.pointer}>▼</Text><Animated.View style={{ width: diameter, height: diameter, transform: [{ rotate: rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'], extrapolate: 'extend' }) }] }}><Svg width={diameter} height={diameter} viewBox="0 0 220 220">{visibleSegments.map(([id, weight], index) => {
        const start = visibleSegments.slice(0, index).reduce((sum, item) => sum + item[1], 0) * 3.6;
        const end = start + weight * 3.6;
        const point = polar((start + end) / 2, 74);
        return <G key={`${id}-${index}`}><Path d={sector(start, end)} fill={colors[id] || '#A8D3C4'} stroke="#FFF7EA" strokeWidth={2} />{weight >= 5 && <SvgText x={point.x} y={point.y + 5} textAnchor="middle" fill="#203E33" fontSize={weight >= 10 ? 20 : 13}>{label(id)}</SvgText>}</G>;
      })}<Circle cx={110} cy={110} r={39} fill="#FFF7EA" stroke="#315B4B" strokeWidth={5} /><SvgText x={110} y={116} textAnchor="middle" fill="#315B4B" fontSize={28}>✦</SvgText></Svg></Animated.View></View>}
    {result ? <Text accessibilityLiveRegion="polite" style={styles.result}>{result.label}</Text> : null}
    {state.monthlyClassic && <View style={styles.monthly}><Text style={styles.monthlyTitle}>🍔 Le Classique du mois</Text><Text style={styles.description}>{state.monthlyClassic.available ? 'À gagner directement sur la roue : 1 % de chance par tour admissible tant que le lot est disponible.' : 'Le Classique du mois n’est plus disponible pour tes tours actuels.'}</Text><Text style={styles.prizeHint}>Un seul lot pour tout le restaurant par mois, tous supports réunis. Sans tirage séparé ni gagnant garanti. Classique seul, sauce et crudités au choix, sans supplément.</Text></View>}
    {!hidePrizes && activePrizes.map(prize => <View key={prize.id} style={styles.prize}><Text style={styles.prizeLabel}>{prize.label}</Text><Text selectable style={styles.prizeCode}>{prize.code}</Text><Text style={styles.prizeHint}>{wheelPrizeHint(prize)} À saisir avant le {new Date(prize.expiresAt).toLocaleDateString('fr-FR')}. Usage unique ; un seul code promo par commande. Retrouve ce code dans Mon compte → Mes offres.</Text></View>)}
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    <WheelRules rules={fullWheelRules(state.rules, state.segments)} open={rulesOpen} onOpen={() => setRulesOpen(true)} onClose={() => setRulesOpen(false)} />
  </View>;
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 600, alignSelf: 'center', padding: 18, borderRadius: 22, backgroundColor: '#D9EEE5', marginVertical: 14, alignItems: 'center' },
  eyebrow: { color: '#315B4B', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#203E33', fontSize: 26, fontWeight: '900', marginTop: 5, textAlign: 'center' },
  orderNotice: { color: '#203E33', fontSize: 18, lineHeight: 26, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  oddsNotice: { color: '#203E33', fontSize: 16, lineHeight: 24, textAlign: 'center', fontWeight: '800', marginVertical: 8 },
  monthly: { width: '100%', backgroundColor: '#FFF7EA', borderColor: '#C8A461', borderWidth: 1, borderRadius: 18, padding: 14, marginVertical: 12 },
  monthlyTitle: { color: '#203E33', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  counter: { width: '100%', backgroundColor: '#315B4B', borderRadius: 18, padding: 16, marginVertical: 14, gap: 8 },
  counterText: { color: '#FFF7EA', fontSize: 31, lineHeight: 39, fontWeight: '900', textAlign: 'center' },
  counterHint: { color: '#FFF7EA', fontSize: 16, lineHeight: 23, fontWeight: '700', textAlign: 'center' },
  description: { color: '#315B4B', fontSize: 15, textAlign: 'center', marginVertical: 8 },
  wheelFrame: { alignItems: 'center', marginVertical: 22 },
  pointer: { position: 'absolute', zIndex: 2, top: -16, color: '#315B4B', fontSize: 31 },
  button: { width: '100%', backgroundColor: '#315B4B', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18 },
  buttonText: { color: '#FFF7EA', fontWeight: '900', fontSize: 17, textAlign: 'center' },
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
