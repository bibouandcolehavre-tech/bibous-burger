import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';

// A decorative wheel, not a pie chart of prize probabilities. The authenticated
// server chooses the result; no slice, pointer or colour implies different odds.
export default function WheelArtwork({ diameter, rotation }) {
  return <View testID="wheel-large-display" style={[styles.frame, { width: diameter, height: diameter }]}>
    <Animated.View style={{ width: diameter, height: diameter, transform: [{ rotate: rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'], extrapolate: 'extend' }) }] }}>
      <Svg width={diameter} height={diameter} viewBox="0 0 220 220" accessible={false}>
        <Circle cx={110} cy={110} r={105} fill="#315B4B" stroke="#E9C569" strokeWidth={6} />
        <Circle cx={110} cy={110} r={89} fill="none" stroke="#FFF7EA" strokeWidth={1} />
        {Array.from({ length: 12 }, (_, index) => {
          const angle = (index * 30 - 90) * Math.PI / 180;
          return <SvgText key={index} x={110 + 73 * Math.cos(angle)} y={116 + 73 * Math.sin(angle)} textAnchor="middle" fill="#E9C569" fontSize={18}>✦</SvgText>;
        })}
      </Svg>
    </Animated.View>
    <View pointerEvents="none" style={styles.center}><Text style={styles.gift}>🎁</Text><Text style={styles.name}>ROUE BIBOU</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', marginVertical: 22 },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  gift: { fontSize: 42 },
  name: { color: '#FFF7EA', fontWeight: '900', fontSize: 15, letterSpacing: 1, marginTop: 8 },
});
