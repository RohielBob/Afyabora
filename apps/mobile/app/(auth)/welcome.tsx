import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Palette alignée sur @glyka/ui-tokens.
// TODO : remplacer par l'import des tokens quand les packages seront buildés (ticket L7-03/L7-05).
const C = {
  primary: '#0B6E6E',
  primaryLight: '#D7EEEE',
  background: '#F7FAFA',
  surface: '#FFFFFF',
  text: '#10231F',
  textMuted: '#52665F',
  border: '#D6E2E0',
  inRange: '#2E8B57',
};

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          {/* Logo */}
          <View style={styles.logoBlock}>
            <View style={styles.logoSquare}>
              <Text style={styles.logoLetter}>G</Text>
            </View>
            <Text style={styles.brand}>Glyka</Text>
            <Text style={styles.slogan}>Suivez. Contrôlez. Comprenez.</Text>
          </View>

          {/* Aperçu : carte de suivi (données fictives) */}
          <View style={styles.card} accessible accessibilityLabel="Aperçu d'une mesure de glycémie">
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>DERNIÈRE MESURE</Text>
              <Text style={styles.demoTag}>Exemple fictif</Text>
            </View>

            <View style={styles.valueRow}>
              <Text style={styles.value}>1,12</Text>
              <Text style={styles.unit}>g/L</Text>
            </View>

            {/* État : symbole + libellé + couleur (jamais la couleur seule) */}
            <View style={styles.badge}>
              <Text style={styles.badgeText}>● Dans la plage</Text>
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.footerText}>Enregistrée même sans réseau</Text>
              <Text style={styles.footerCheck}>✓</Text>
            </View>
          </View>

          {/* Message */}
          <View style={styles.messageBlock}>
            <Text style={styles.title}>Votre historique glycémique, toujours avec vous.</Text>
            <Text style={styles.description}>
              Enregistrez vos mesures, comprenez votre évolution et choisissez qui voit quoi, et
              pendant combien de temps.
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Créer un compte"
              onPress={() => router.push('/(auth)/sign-up')}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>Créer un compte</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Se connecter"
              onPress={() => router.push('/(auth)/sign-in')}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryButtonText}>Se connecter</Text>
            </Pressable>
          </View>

          {/* Avertissement d'usage (exigence du cahier des charges) */}
          <Text style={styles.disclaimer}>
            Glyka est un outil d'aide au suivi. Il ne remplace pas l'avis d'un professionnel de
            santé.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  container: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    justifyContent: 'space-between',
    gap: 20,
  },

  logoBlock: {
    alignItems: 'center',
  },
  logoSquare: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  logoLetter: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
  },
  brand: {
    fontSize: 30,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.8,
  },
  slogan: {
    marginTop: 4,
    fontSize: 14,
    color: C.textMuted,
    textAlign: 'center',
  },

  card: {
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    shadowColor: C.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.primary,
    letterSpacing: 1.2,
  },
  demoTag: {
    fontSize: 11,
    color: C.textMuted,
    backgroundColor: C.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 14,
  },
  value: {
    fontSize: 48,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -1,
  },
  unit: {
    fontSize: 16,
    fontWeight: '600',
    color: C.textMuted,
    marginLeft: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: C.inRange,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 18,
    paddingTop: 12,
  },
  footerText: {
    fontSize: 12,
    color: C.textMuted,
  },
  footerCheck: {
    color: C.inRange,
    fontWeight: '800',
  },

  messageBlock: {
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  description: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: C.textMuted,
    textAlign: 'center',
  },

  actions: {
    gap: 12,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: C.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },

  disclaimer: {
    fontSize: 11,
    lineHeight: 16,
    color: C.textMuted,
    textAlign: 'center',
  },
});
