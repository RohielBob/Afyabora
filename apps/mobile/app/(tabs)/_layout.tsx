import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ComponentProps } from 'react';
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
        tabBarLabelStyle: { fontFamily: fontFiles.semibold, fontSize: 11 },
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
