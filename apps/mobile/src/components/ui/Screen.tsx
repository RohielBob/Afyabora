// Cadre d'un écran : fond du thème, zones sûres (encoche), défilement, largeur de lecture limitée,
// et apparition en fondu du contenu.
import { useEffect, useRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fadeIn, spacing, useReducedMotion, useTheme } from '@/theme';
import { pullToRefresh, type RefreshProps } from './PullToRefresh';

export function Screen({
  children,
  scroll = true,
  padded = true,
  scrollKey,
  refresh,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** Quand cette valeur change (ex. étape d'un assistant), l'écran remonte en haut. */
  scrollKey?: string | number;
  /** « Tirer pour rafraîchir » (L8-07), pour un écran qui défile. */
  refresh?: RefreshProps;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (scrollKey !== undefined) scrollRef.current?.scrollTo({ y: 0, animated: !reduced });
  }, [scrollKey, reduced]);
  const content = (
    <Animated.View
      entering={fadeIn(reduced)}
      style={{
        width: '100%',
        maxWidth: 560, // lisible aussi sur tablette et dans le navigateur
        alignSelf: 'center',
        padding: padded ? spacing.xl : 0,
        gap: spacing.xl,
        // Écran qui défile : le contenu grandit avec ce qu'il contient. Écran FIXE (liste ou conversation
        // qui défile à l'intérieur, zone de saisie en bas) : il prend EXACTEMENT la hauteur de l'écran ;
        // sinon, sur le web, il grandissait avec sa liste et poussait la zone de saisie hors de l'écran (L9-09).
        ...(scroll ? { flexGrow: 1 } : { flex: 1, minHeight: 0 }),
      }}
    >
      {children}
    </Animated.View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* iOS : le contenu remonte au-dessus du clavier (Android le fait tout seul). */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            refreshControl={pullToRefresh(refresh)}
          >
            {content}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{content}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
