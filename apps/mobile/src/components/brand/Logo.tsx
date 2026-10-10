// Logo Afyabora : goutte rouge, cœur blanc et tracé de pouls. Dessiné en vectoriel (react-native-svg)
// d'après le logo validé par le groupe — voir docs/design/marque-afyabora.md.
import { Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Polyline, Stop } from 'react-native-svg';
import { brand, fontFiles, useTheme } from '@/theme';

// Géométrie du dessin (repère interne du SVG), partagée avec l'écran de lancement animé.
export const MARK_WIDTH = 457;
export const MARK_HEIGHT = 637;
export const DROP_PATH =
  'M 232 0 C 189 85 0 244 0 409 A 228.5 228.5 0 0 0 457 409 C 457 244 275 85 232 0 Z';
export const HEART_PATH =
  'M 229 553 C 157 493 83 441 83 369 C 83 329 112 304 148 304 C 185 304 211 325 229 355 C 247 325 273 304 310 304 C 346 304 375 329 375 369 C 375 441 301 493 229 553 Z';
export const PULSE_POINTS =
  '97,432 177,432 189,409 203,367 231,487 251,401 265,432 277,404 291,432 361,432';
export const PULSE_COLOR = '#B3002A';

/** Longueur totale du tracé de pouls (pour l'animation « le tracé se dessine »). */
export const PULSE_LENGTH = PULSE_POINTS.split(' ')
  .map((p) => p.split(',').map(Number) as [number, number])
  .reduce((total, point, i, all) => {
    const previous = all[i - 1];
    return previous ? total + Math.hypot(point[0] - previous[0], point[1] - previous[1]) : total;
  }, 0);

/** Dégradé de la goutte (définitions SVG réutilisables). */
export function DropGradient({ id = 'afyaDrop' }: { id?: string }) {
  return (
    <Defs>
      <LinearGradient id={id} x1="0.08" y1="0.15" x2="0.95" y2="0.95">
        <Stop offset="0" stopColor={brand.redLight} />
        <Stop offset="0.45" stopColor={brand.red} />
        <Stop offset="1" stopColor={brand.redDark} />
      </LinearGradient>
    </Defs>
  );
}

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
        <DropGradient />
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

/**
 * Le nom : « Afya » en bleu marine, « bora » en rouge corail.
 * En mode sombre, le bleu marine serait illisible : « Afya » passe en blanc cassé (règle de la charte).
 */
export function Wordmark({ size = 32 }: { size?: number }) {
  const { mode, colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontFamily: fontFiles.extrabold,
        fontSize: size,
        lineHeight: size * 1.2,
        letterSpacing: -size * 0.025,
      }}
    >
      <Text style={{ color: mode === 'dark' ? colors.text : brand.navy }}>Afya</Text>
      <Text style={{ color: brand.coral }}>bora</Text>
    </Text>
  );
}
