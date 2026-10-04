import { Tabs } from 'expo-router';
import { colors } from '@/theme';

// TODO(L7-05) : icônes de l'onglet (une icône + un libellé, pas de couleur seule).
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="timeline" options={{ title: 'Chronologie' }} />
      <Tabs.Screen name="insights" options={{ title: 'Analyse' }} />
      <Tabs.Screen name="share" options={{ title: 'Partager' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
