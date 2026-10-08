// Logo Afyabora : goutte rouge, cœur blanc et tracé de pouls. Dessiné en vectoriel (react-native-svg)
// d'après le logo validé par le groupe — voir docs/design/marque-afyabora.md.
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Polyline, Stop } from 'react-native-svg';
import { brand } from '@/theme';

// Dimensions du dessin (repère interne du SVG).
const MARK_WIDTH = 457;
const MARK_HEIGHT = 637;

const DROP_PATH =
  'M 232 0 C 189 85 0 244 0 409 A 228.5 228.5 0 0 0 457 409 C 457 244 275 85 232 0 Z';
const HEART_PATH =
  'M 229 553 C 157 493 83 441 83 369 C 83 329 112 304 148 304 C 185 304 211 325 229 355 C 247 325 273 304 310 304 C 346 304 375 329 375 369 C 375 441 301 493 229 553 Z';
const PULSE_POINTS =
  '97,432 177,432 189,409 203,367 231,487 251,401 265,432 277,404 291,432 361,432';
const PULSE_COLOR = '#B3002A';

/** La goutte seule. `size` est la HAUTEUR en points ; la largeur suit les proportions du logo. */
export function LogoMark({ size = 96 }: { size?: number }) {
  const width = (size * MARK_WIDTH) / MARK_HEIGHT;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Logo Afyabora"
      style={{ width, height: size }}
    >
      <Svg width={width} height={size} viewBox={`0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`}>
        <Defs>
          <LinearGradient id="afyaDrop" x1="0.08" y1="0.15" x2="0.95" y2="0.95">
            <Stop offset="0" stopColor={brand.redLight} />
            <Stop offset="0.45" stopColor={brand.red} />
            <Stop offset="1" stopColor={brand.redDark} />
          </LinearGradient>
        </Defs>
        <Path d={DROP_PATH} fill="url(#afyaDrop)" />
        <Path d={HEART_PATH} fill="#FFFFFF" />
        <Polyline
          points={PULSE_POINTS}
          fill="none"
          stroke={PULSE_COLOR}
          strokeWidth={8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/** Le nom : « Afya » en bleu marine, « bora » en rouge corail. */
export function Wordmark({ size = 32 }: { size?: number }) {
  return (
    <Text style={[styles.word, { fontSize: size, lineHeight: size * 1.2 }]}>
      <Text style={{ color: brand.navy }}>Afya</Text>
      <Text style={{ color: brand.coral }}>bora</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  word: {
    fontWeight: '800',
    letterSpacing: -0.8,
  },
});
