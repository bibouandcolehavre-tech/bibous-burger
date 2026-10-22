import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import useExperienceMotion from './useExperienceMotion';
import useContestOverview from './useContestOverview';
const { contestPresentation } = require('./contest-presentation');

export function AnimatedOrderAction({ onPress }) {
  const allowed = useExperienceMotion(), phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!allowed) { phase.setValue(0); return; }
    const animation = Animated.loop(Animated.sequence([Animated.timing(phase, { toValue: 1, duration: 1400, useNativeDriver: Platform.OS !== 'web' }), Animated.timing(phase, { toValue: 0, duration: 1400, useNativeDriver: Platform.OS !== 'web' })]));
    animation.start(); return () => animation.stop();
  }, [allowed, phase]);
  return <Animated.View style={{ transform: [{ translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }}><Pressable testID="animated-order-action" accessibilityRole="button" accessibilityLabel="Commander en retrait ou en livraison" onPress={onPress} style={s.order}>
    <Animated.Text style={[s.bag, { transform: [{ rotate: phase.interpolate({ inputRange: [0, 1], outputRange: ['-7deg', '7deg'] }) }] }]} importantForAccessibility="no">🛍️</Animated.Text>
    <View style={s.copy}><Text style={s.orderTitle}>Commander</Text><Text style={s.orderDetail}>Retrait · Livraison</Text></View><Text importantForAccessibility="no" style={s.arrow}>→</Text>
  </Pressable></Animated.View>;
}
function FallingGift({ index, allowed }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!allowed) { progress.setValue(.35); return; }
    const animation = Animated.loop(Animated.sequence([Animated.delay(index * 180), Animated.timing(progress, { toValue: 1, duration: 2200 + index * 150, useNativeDriver: Platform.OS !== 'web' }), Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: Platform.OS !== 'web' })]));
    animation.start(); return () => animation.stop();
  }, [allowed, progress, index]);
  return <Animated.View importantForAccessibility="no-hide-descendants" style={[s.gift, { backgroundColor: ['#2366B8', '#BF3540', '#28774F', '#D9A21F'][index % 4], left: (index % 3) * 25, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-35, 125] }) }, { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['-16deg', '20deg'] }) }] }]}><Text style={s.giftText}>🎁</Text></Animated.View>;
}
export function CompactContestInvitation({ apiBaseUrl, token, onOpenContest }) {
  const data = useContestOverview(apiBaseUrl, token), allowed = useExperienceMotion(), [dismissed, setDismissed] = useState(false);
  const info = contestPresentation(data?.contest, data?.participation);
  if (dismissed || !info) return null;
  return <View testID="compact-contest-invitation" style={s.contest}>
    <Pressable accessibilityRole="button" onPress={onOpenContest} style={s.contestMain}><View style={s.copy}><Text style={s.eyebrow}>LE CONCOURS BIBOU</Text><Text style={s.contestTitle}>{info.active ? 'Une pause pour tenter ta chance ?' : info.title}</Text><Text style={s.contestLink}>{info.action} →</Text><Text style={s.small}>Facultatif · sans achat obligatoire</Text></View><View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={s.rain}>{Array.from({ length: 6 }, (_, index) => <FallingGift key={index} index={index} allowed={allowed} />)}</View></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Masquer l’invitation au concours" onPress={() => setDismissed(true)} style={s.close}><Text style={s.closeText}>×</Text></Pressable>
  </View>;
}
const s = StyleSheet.create({
  order: { minHeight: 100, padding: 18, marginVertical: 14, borderRadius: 18, backgroundColor: '#F9D583', flexDirection: 'row', alignItems: 'center', gap: 13 }, bag: { fontSize: 32 }, copy: { flex: 1, minWidth: 0 }, orderTitle: { color: '#315B4B', fontWeight: '800', fontSize: 24 }, orderDetail: { color: '#315B4B', fontSize: 13, marginTop: 4 }, arrow: { fontSize: 28, color: '#315B4B' },
  contest: { borderRadius: 17, backgroundColor: '#F9D583', marginVertical: 13, overflow: 'hidden', position: 'relative' }, contestMain: { minHeight: 132, padding: 16, paddingRight: 90 }, eyebrow: { fontSize: 12, fontWeight: '800', color: '#315B4B', letterSpacing: .7 }, contestTitle: { fontSize: 19, lineHeight: 23, fontWeight: '800', color: '#315B4B', marginTop: 5 }, contestLink: { fontSize: 13, fontWeight: '700', color: '#315B4B', marginTop: 8 }, small: { color: '#405447', fontSize: 11, marginTop: 5 }, close: { position: 'absolute', right: 0, top: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 }, closeText: { color: '#315B4B', fontSize: 25 }, rain: { position: 'absolute', right: 9, top: 25, width: 75, height: 110, overflow: 'hidden' }, gift: { position: 'absolute', top: 0, width: 29, height: 29, borderRadius: 7, alignItems: 'center', justifyContent: 'center' }, giftText: { fontSize: 21 },
});
