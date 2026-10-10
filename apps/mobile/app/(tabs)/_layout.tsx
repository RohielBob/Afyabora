import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ComponentProps } from 'react';
import { AddTabButton } from '@/features/measurements';
import { fontFiles, useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Icône d'onglet : pleine quand l'onglet est actif, contour sinon (forme + couleur + libellé). */
const icon =
  (active: IconName, inactive: IconName) =>
  ({ color, focused, size }: { color: string; focused: boolean; size: number }) => (
    <Ionicons name={focused ? active : inactive} size={size - 2} color={color} />
  );

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryText,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        // 6 emplacements avec le « + » central (L2-03) : libellés un peu plus petits et sans marge
        // intérieure ; l'onglet chronologie s'appelle « Historique » (plus court, tient sur 375 px).
        tabBarLabelStyle: { fontFamily: fontFiles.semibold, fontSize: 10, letterSpacing: -0.1 },
        tabBarItemStyle: { paddingHorizontal: 0 },
        animation: 'shift', // léger glissement entre onglets
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarIcon: icon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="timeline"
        options={{ title: t('tabs.timeline'), tabBarIcon: icon('time', 'time-outline') }}
      />
      {/* « + » au centre : ouvre la saisie d'une mesure (L2-03, CDC F2). */}
      <Tabs.Screen
        name="add"
        options={{ title: t('tabs.add'), tabBarButton: () => <AddTabButton /> }}
      />
      <Tabs.Screen
        name="insights"
        options={{ title: t('tabs.insights'), tabBarIcon: icon('analytics', 'analytics-outline') }}
      />
      <Tabs.Screen
        name="share"
        options={{ title: t('tabs.share'), tabBarIcon: icon('qr-code', 'qr-code-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: icon('person-circle', 'person-circle-outline'),
        }}
      />
    </Tabs>
  );
}
