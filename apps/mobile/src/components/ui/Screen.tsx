// Cadre d'un écran : fond du thème, zones sûres (encoche), défilement, largeur de lecture limitée,
// et apparition en fondu du contenu.
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fadeIn, spacing, useReducedMotion, useTheme } from '@/theme';

export function Screen({
  children,
  scroll = true,
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const content = (
    <Animated.View
      entering={fadeIn(reduced)}
      style={{
        width: '100%',
        maxWidth: 560, // lisible aussi sur tablette et dans le navigateur
        alignSelf: 'center',
        padding: padded ? spacing.xl : 0,
        gap: spacing.xl,
        flexGrow: 1,
      }}
    >
      {children}
    </Animated.View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{content}</View>
      )}
    </SafeAreaView>
  );
}
