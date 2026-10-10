// Texte de l'application : UN style de l'échelle typographique (jetons `textStyles`) + une couleur de rôle.
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import {
  fontFiles,
  textStyles,
  useTheme,
  type TextStyleToken,
  type TextVariant,
  type ThemeColors,
} from '@/theme';

type Tone = 'default' | 'muted' | 'subtle' | 'primary' | 'onPrimary' | 'danger' | 'success';

const TONE: Record<Tone, keyof ThemeColors> = {
  default: 'text',
  muted: 'textMuted',
  subtle: 'textSubtle',
  primary: 'primaryText',
  onPrimary: 'onPrimary',
  danger: 'danger',
  success: 'success',
};

/** Style complet d'une variante (utile aussi hors du composant, ex. champ de saisie). */
export function textStyle(variant: TextVariant): TextStyle {
  const t: TextStyleToken = textStyles[variant];
  return {
    fontFamily: fontFiles[t.weight],
    fontSize: t.fontSize,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
    ...(t.uppercase ? { textTransform: 'uppercase' } : {}),
    ...(t.tabular ? { fontVariant: ['tabular-nums'] } : {}),
  };
}

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: Tone;
  /** @deprecated utiliser tone="muted" */
  muted?: boolean;
  align?: TextStyle['textAlign'];
}

export function Text({ variant = 'body', tone, muted, align, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const color = colors[TONE[tone ?? (muted ? 'muted' : 'default')]];
  return (
    <RNText
      maxFontSizeMultiplier={1.6} // suit la taille de police du téléphone, sans casser la mise en page
      {...rest}
      style={[textStyle(variant), { color }, align ? { textAlign: align } : null, style]}
    />
  );
}
