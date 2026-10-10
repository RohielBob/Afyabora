import { Stack } from 'expo-router';

// L'accueil est la base de la pile d'authentification (Retour depuis Connexion / Inscription y ramène).
export const unstable_settings = { anchor: 'welcome' };

export default function Layout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
