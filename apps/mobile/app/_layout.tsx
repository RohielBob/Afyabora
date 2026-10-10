import { useFonts } from 'expo-font';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AnimatedSplash } from '@/components/brand';
import { AppProviders } from '@/providers/AppProviders';
import { useTheme } from '@/theme';
import { appFonts } from '@/theme/fonts';

// L'écran de lancement natif (logo sur fond blanc) reste affiché tant que la police n'est pas chargée :
// on n'affiche jamais un écran avec la mauvaise police qui « saute » ensuite.
void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { colors, mode } = useTheme();
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
        <Stack.Screen
          name="measurement/new"
          options={{ presentation: 'modal', headerShown: true, title: 'Nouvelle mesure' }}
        />
        <Stack.Screen
          name="event/new"
          options={{ presentation: 'modal', headerShown: true, title: 'Nouvel événement' }}
        />
      </Stack>
      {/* Animation de lancement, par-dessus l'app, jouée une seule fois. */}
      {!splashDone ? <AnimatedSplash onFinish={() => setSplashDone(true)} /> : null}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const ready = fontsLoaded || !!fontError; // police indisponible : on continue avec la police système

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
