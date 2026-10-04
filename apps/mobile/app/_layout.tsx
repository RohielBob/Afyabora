import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/providers/AppProviders';

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="measurement/new" options={{ presentation: 'modal', headerShown: true, title: 'Nouvelle mesure' }} />
        <Stack.Screen name="event/new" options={{ presentation: 'modal', headerShown: true, title: 'Nouvel événement' }} />
      </Stack>
    </AppProviders>
  );
}
