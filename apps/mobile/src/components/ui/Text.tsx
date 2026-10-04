import { Text as RNText, type TextProps } from 'react-native';
import { fontSizes, useTheme } from '@/theme';

type Variant = 'title' | 'heading' | 'body' | 'caption';
const SIZE: Record<Variant, number> = {
  title: fontSizes.xxl,
  heading: fontSizes.xl,
  body: fontSizes.md,
  caption: fontSizes.sm,
};

export function Text({ variant = 'body', muted, style, ...rest }: TextProps & { variant?: Variant; muted?: boolean }) {
  const theme = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        { fontSize: SIZE[variant], color: muted ? theme.textMuted : theme.text, fontWeight: variant === 'body' ? '400' : '700' },
        style,
      ]}
    />
  );
}
