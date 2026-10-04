import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

const C = {
  cream: '#FAF1E3',
  forest: '#284B3D',
  green: '#315C4B',
  mint: '#D6ECE2',
  terra: '#BA7357',
  rust: '#8A422F',
  gold: '#EFBC70',
  skin: '#E8AC83',
};

const SCENES = [
  { eyebrow: '01 · CLICK & COLLECT', title: 'Ton burger t’attend\nchez Bibou !', caption: 'Commande dans l’app,\nrécupère sur place.', name: 'Retrait sur place' },
  { eyebrow: '02 · LIVRAISON', title: 'Le goût de Bibou\nvient jusqu’à toi.', caption: 'Choisis ton créneau,\non s’occupe du trajet.', name: 'Livraison' },
  { eyebrow: '03 · RÉSERVATION', title: 'On te garde\nune place.', caption: 'Réserve ta table en quelques secondes,\non prépare ton accueil.', name: 'Réservation de table' },
];

function Person({ x, y, scale = 1, shirt = C.terra, waving = false }) {
  return <G transform={`translate(${x} ${y}) scale(${scale})`}>
    <Rect x="23" y="114" width="17" height="49" rx="7" fill={C.forest} />
    <Rect x="54" y="114" width="17" height="49" rx="7" fill={C.forest} />
    <Path d="M18 65 Q18 50 35 48 L61 48 Q78 50 78 65 L76 122 L18 122 Z" fill={shirt} />
    <Path d="M20 63 L9 99" stroke={C.skin} strokeWidth="14" strokeLinecap="round" />
    <Path d={waving ? 'M75 63 L97 35' : 'M75 63 L89 101'} stroke={C.skin} strokeWidth="14" strokeLinecap="round" />
    <Rect x="25" y="5" width="47" height="47" rx="22" fill={C.skin} />
    <Path d="M24 28 Q25 -3 52 0 Q76 1 75 27 Q60 15 46 18 Q30 18 24 28" fill={C.forest} />
    <Circle cx="43" cy="32" r="2" fill={C.forest} /><Circle cx="59" cy="32" r="2" fill={C.forest} />
    <Path d="M47 41 Q53 46 59 41" stroke={C.rust} strokeWidth="2" strokeLinecap="round" fill="none" />
  </G>;
}

function PickupArt({ height }) {
  return <Svg viewBox="0 0 340 205" width="100%" height={height} accessible accessibilityLabel="Un client récupère son sac Bibou au comptoir">
    <Ellipse cx="170" cy="188" rx="154" ry="10" fill="#B6D7C8" />
    <Circle cx="278" cy="45" r="40" fill="#EAF6EF" />
    <Person x={39} y={16} scale={1.03} waving />
    <Rect x="172" y="123" width="135" height="63" rx="12" fill={C.forest} />
    <Rect x="166" y="116" width="148" height="15" rx="7" fill={C.rust} />
    <Path d="M219 61 L279 61 L285 119 L213 119 Z" fill={C.gold} />
    <Path d="M232 64 Q234 40 248 40 Q262 40 266 64" fill="none" stroke={C.rust} strokeWidth="5" />
    <SvgText x="226" y="96" fontSize="17" fontStyle="italic" fontWeight="bold" fill={C.forest}>Bibou</SvgText>
    <SvgText x="286" y="59" fontSize="29" fill={C.rust}>✦</SvgText>
  </Svg>;
}

function DeliveryArt({ height }) {
  return <Svg viewBox="0 0 340 205" width="100%" height={height} accessible accessibilityLabel="Un livreur Bibou roule en scooter">
    <Circle cx="70" cy="47" r="36" fill="#EAF6EF" />
    <Rect x="18" y="181" width="304" height="9" rx="5" fill={C.terra} />
    <Line x1="69" y1="185" x2="102" y2="185" stroke={C.cream} strokeWidth="3" /><Line x1="223" y1="185" x2="256" y2="185" stroke={C.cream} strokeWidth="3" />
    <Circle cx="94" cy="157" r="27" fill={C.forest} /><Circle cx="94" cy="157" r="12" fill={C.gold} />
    <Circle cx="257" cy="157" r="27" fill={C.forest} /><Circle cx="257" cy="157" r="12" fill={C.gold} />
    <Path d="M92 137 Q128 116 186 127 L218 159 L117 159 Q105 152 92 137 Z" fill={C.terra} />
    <Path d="M185 123 L217 88 L246 88" fill="none" stroke={C.forest} strokeWidth="9" strokeLinecap="round" />
    <Rect x="134" y="104" width="66" height="14" rx="7" fill={C.forest} />
    <Path d="M153 80 L198 89 L188 119 L145 109 Z" fill={C.forest} />
    <Path d="M183 91 L221 104" stroke={C.skin} strokeWidth="13" strokeLinecap="round" />
    <Rect x="168" y="42" width="38" height="39" rx="18" fill={C.skin} />
    <Path d="M164 57 Q165 32 190 32 Q211 34 209 54 Z" fill={C.forest} />
    <Rect x="73" y="68" width="69" height="61" rx="8" fill={C.gold} />
    <SvgText x="98" y="109" fontSize="34" fontWeight="bold" fill={C.forest}>B</SvgText>
    <SvgText x="269" y="70" fontSize="28" fill={C.rust}>✦</SvgText>
  </Svg>;
}

function BookingArt({ height }) {
  return <Svg viewBox="0 0 340 205" width="100%" height={height} accessible accessibilityLabel="Deux personnes sont accueillies à une table Bibou">
    <Ellipse cx="170" cy="189" rx="155" ry="10" fill="#B6D7C8" />
    <Circle cx="278" cy="45" r="39" fill="#EAF6EF" />
    <Person x={16} y={50} scale={0.78} waving shirt={C.forest} />
    <Person x={244} y={55} scale={0.76} shirt={C.terra} />
    <Rect x="157" y="145" width="15" height="42" fill={C.forest} />
    <Rect x="93" y="134" width="149" height="17" rx="8" fill={C.rust} />
    <Ellipse cx="170" cy="133" rx="37" ry="8" fill={C.cream} />
    <Path d="M146 124 Q148 102 170 102 Q193 103 195 124 Z" fill={C.gold} />
    <Rect x="146" y="122" width="50" height="7" rx="3" fill={C.forest} />
    <Rect x="146" y="128" width="50" height="6" rx="3" fill={C.terra} />
    <SvgText x="290" y="74" fontSize="28" fill={C.rust}>✦</SvgText>
  </Svg>;
}

const ART = [PickupArt, DeliveryArt, BookingArt];

export default function WelcomeCarousel() {
  const { height } = useWindowDimensions();
  const compact = height < 750;
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(() => Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const opacity = useRef(new Animated.Value(1)).current;
  const arrival = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS === 'web' || reduceMotion) return undefined;
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setReduceMotion(value); }).catch(() => {});
    return () => { live = false; };
  }, [reduceMotion]);
  useEffect(() => {
    if (reduceMotion) return undefined;
    const timer = setInterval(() => setIndex(current => (current + 1) % SCENES.length), 4400);
    return () => clearInterval(timer);
  }, [reduceMotion]);
  useEffect(() => {
    if (reduceMotion) { opacity.setValue(1); arrival.setValue(0); bob.setValue(0); return undefined; }
    opacity.setValue(0);
    arrival.setValue(20);
    const entrance = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 430, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(arrival, { toValue: 0, duration: 430, useNativeDriver: Platform.OS !== 'web' }),
    ]);
    bob.setValue(0);
    const motion = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 1700, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(bob, { toValue: 0, duration: 1700, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    entrance.start(); motion.start();
    return () => { entrance.stop(); motion.stop(); };
  }, [index, reduceMotion, opacity, arrival, bob]);

  const scene = SCENES[index];
  const Illustration = ART[index];
  const movement = bob.interpolate({ inputRange: [0, 1], outputRange: index === 1 ? [-10, 22] : [0, -7] });
  return <View style={styles.wrap} accessibilityLabel="Découvrir Bibou : retrait, livraison et réservation">
    <Animated.View style={[styles.slide, compact && styles.slideCompact, { opacity, transform: [{ translateX: arrival }] }]}>
      <Text style={styles.eyebrow}>{scene.eyebrow}</Text>
      <Text style={[styles.title, compact && styles.titleCompact]}>{scene.title}</Text>
      <Animated.View style={[styles.art, compact && styles.artCompact, { transform: [{ translateX: index === 1 ? movement : 0 }, { translateY: index === 1 ? 0 : movement }] }]}><Illustration height={compact ? 165 : 205} /></Animated.View>
      <Text style={[styles.caption, compact && styles.captionCompact]}>{scene.caption}</Text>
    </Animated.View>
    <View style={styles.dots}>{SCENES.map((item, itemIndex) => <Pressable key={item.name} accessibilityRole="button" accessibilityLabel={`Voir ${item.name.toLowerCase()}`} accessibilityState={{ selected: itemIndex === index }} onPress={() => setIndex(itemIndex)} style={styles.dotTap}><View style={[styles.dot, itemIndex === index && styles.dotActive]} /></Pressable>)}</View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  slide: { minHeight: 375, borderRadius: 26, paddingHorizontal: 14, paddingTop: 20, paddingBottom: 16, backgroundColor: C.mint, overflow: 'hidden', alignItems: 'center' },
  slideCompact: { minHeight: 310, paddingTop: 12, paddingBottom: 10 },
  eyebrow: { color: C.rust, fontSize: 12, fontWeight: '900', letterSpacing: 1.8, textAlign: 'center' },
  title: { color: C.forest, fontSize: 27, lineHeight: 31, fontWeight: '900', textAlign: 'center', marginTop: 10 },
  titleCompact: { fontSize: 24, lineHeight: 27, marginTop: 5 },
  art: { width: '100%', height: 205, justifyContent: 'center', alignItems: 'center' },
  artCompact: { height: 165 },
  caption: { color: C.forest, fontSize: 15, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  captionCompact: { fontSize: 14, lineHeight: 18 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 3 },
  dotTap: { width: 43, height: 37, justifyContent: 'center', alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#A9C5B9' },
  dotActive: { width: 27, borderRadius: 5, backgroundColor: C.forest },
});
