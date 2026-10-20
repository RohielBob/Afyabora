import { useFonts } from 'expo-font';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AnimatedSplash } from '@/components/brand';
import { initSession, signOut, useSession } from '@/features/auth';
import { LockScreen, initAppLock, resetAppLock, useAppLock } from '@/features/security';
import { useSyncTriggers } from '@/features/sync';
import { wakeServer } from '@/lib/server-wake';
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
  'settings/account',
  'settings/about',
  'measurement/[id]',
  'import/index',
  'import/mapping',
  'import/report',
  'assistant/index',
  'assistant/chat',
  'assistant/sheets/index',
  'assistant/sheets/[id]',
  'report/index',
  'share/active',
  'share/log',
  'share/new',
  'emergency/index',
  'emergency/edit',
  'sync/index',
] as const;

function RootNavigator() {
  const { colors, mode } = useTheme();
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const lock = useAppLock();
  const [splashDone, setSplashDone] = useState(false);
  // L8-07 : session ouverte ⇒ synchronisation à l'ouverture, au retour du réseau et dans l'application.
  useSyncTriggers(signedIn);

  // Le verrouillage appartient au compte : il est effacé quand la session se termine (déconnexion, expiration).
  useEffect(() => {
    if (session.status === 'signedOut' && lock.settings.enabled) void resetAppLock();
  }, [session.status, lock.settings.enabled]);

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
          {/* Saisie d'une mesure (L2-03) : fenêtre qui monte du bas ; l'écran a son propre en-tête traduit. */}
          <Stack.Screen
            name="measurement/new"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          {/* Ajout d'un événement (L2-10) : même présentation que la saisie d'une mesure ; l'écran a son
              propre en-tête traduit (plus de titre en dur ici). */}
          <Stack.Screen
            name="event/new"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
        </Stack.Protected>

        {/* Textes légaux (L1-10) : lisibles avec ou sans compte (avant l'inscription comme après). */}
        <Stack.Screen name="legal/privacy" />
        {/* Langue : modifiable aussi AVANT de créer un compte (bouton sur l'accueil). */}
        <Stack.Screen name="settings/language" />
        <Stack.Screen name="legal/disclaimer" />

        {/* Planche de style : visible sans compte en développement uniquement. */}
        <Stack.Protected guard={__DEV__ || signedIn}>
          <Stack.Screen name="settings/design" />
        </Stack.Protected>
      </Stack>
      {/* Verrouillage (L1-09) : par-dessus l'app, rien n'est visible derrière tant qu'il n'est pas levé. */}
      {signedIn && lock.locked ? (
        <LockScreen pinLength={lock.settings.pinLength} onForgot={signOut} />
      ) : null}
      {/* Animation de lancement, par-dessus l'app, jouée une seule fois. */}
      {!splashDone ? <AnimatedSplash onFinish={() => setSplashDone(true)} /> : null}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const session = useSession();
  const lock = useAppLock();
  const fontsReady = fontsLoaded || !!fontError; // police indisponible : on continue avec la police système
  // On attend aussi le verrouillage : l'app ne doit jamais s'afficher une fraction de seconde avant lui.
  const ready = fontsReady && session.status !== 'loading' && lock.ready;

  // Rouvre la session enregistrée et lit les réglages de verrouillage (coffre sécurisé : rapide, sans réseau).
  // Réveille aussi le serveur hébergé, qui peut mettre une minute à redémarrer (src/lib/server-wake.ts).
  useEffect(() => {
    void initSession();
    void initAppLock();
    void wakeServer();
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
