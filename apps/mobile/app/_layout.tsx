import { useFonts } from 'expo-font';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AnimatedSplash } from '@/components/brand';
import { initSession, useSession } from '@/features/auth';
import { AppProviders } from '@/providers/AppProviders';
import { useTheme } from '@/theme';
import { appFonts } from '@/theme/fonts';

// L'écran de lancement natif (logo sur fond blanc) reste affiché tant que la police et la session ne sont
// pas prêtes : on n'affiche jamais un écran qui « saute » (mauvaise police, accueil puis compte…).
void SplashScreen.preventAutoHideAsync();

// Écran de base de la pile : quand un écran est refusé (ex. Paramètres sans session), Expo Router revient
// à « index », qui choisit le bon écran selon la session (accueil, connexion, assistant ou onglets).
export const unstable_settings = { anchor: 'index' };

// Écrans réservés aux personnes connectées (L1-07). Sans session, Expo Router renvoie vers l'accueil.
const PRIVATE_SCREENS = [
  '(tabs)',
  '(onboarding)',
  'settings/index',
  'settings/appearance',
  'settings/units-thresholds',
  'settings/notifications',
  'settings/security',
  'settings/about',
  'measurement/[id]',
  'import/index',
  'import/mapping',
  'import/report',
  'insights/ask',
  'report/index',
  'share/active',
  'share/log',
  'share/new',
  'emergency/index',
  'emergency/edit',
] as const;

function RootNavigator() {
  const { colors, mode } = useTheme();
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const [splashDone, setSplashDone] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background }, // pas d'éclair blanc en mode sombre
          animation: 'fade_from_bottom', // transition sobre et identique sur Android et iOS
          animationDuration: 280,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.primaryText,
          headerTitleStyle: { color: colors.text },
          headerShadowVisible: false,
        }}
      >
        {/* Connexion, inscription… : seulement SANS session (une fois connecté, on n'y revient pas). */}
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        <Stack.Protected guard={signedIn}>
          {PRIVATE_SCREENS.map((name) => (
            <Stack.Screen key={name} name={name} />
          ))}
          <Stack.Screen
            name="measurement/new"
            options={{ presentation: 'modal', headerShown: true, title: 'Nouvelle mesure' }}
          />
          <Stack.Screen
            name="event/new"
            options={{ presentation: 'modal', headerShown: true, title: 'Nouvel événement' }}
          />
        </Stack.Protected>

        {/* Planche de style : visible sans compte en développement uniquement. */}
        <Stack.Protected guard={__DEV__ || signedIn}>
          <Stack.Screen name="settings/design" />
        </Stack.Protected>
      </Stack>
      {/* Animation de lancement, par-dessus l'app, jouée une seule fois. */}
      {!splashDone ? <AnimatedSplash onFinish={() => setSplashDone(true)} /> : null}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const session = useSession();
  const fontsReady = fontsLoaded || !!fontError; // police indisponible : on continue avec la police système
  const ready = fontsReady && session.status !== 'loading';

  // Rouvre la session enregistrée (lecture du coffre sécurisé : rapide, et sans réseau).
  useEffect(() => {
    void initSession();
  }, []);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
