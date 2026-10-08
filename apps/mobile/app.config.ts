import type { ExpoConfig } from 'expo/config';

// Identité : nom affiché = Afyabora. Les identifiants techniques (slug, scheme, package Android,
// bundle iOS) restent « glyka » pour l'instant — voir docs/adr/0007-nom-afyabora-identifiants-internes.md.
const config: ExpoConfig = {
  name: 'Afyabora',
  slug: 'glyka',
  scheme: 'glyka',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png', // provisoire (redessiné depuis le logo) — TODO(L7-04) : version finale du designer
  splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#FFFFFF' }, // TODO(L7-04)
  android: {
    package: 'com.glyka.app',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#FFFFFF' },
    permissions: ['USE_BIOMETRIC', 'POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM'],
  },
  ios: { bundleIdentifier: 'com.glyka.app', supportsTablet: false },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    // TODO(L8-02) : valider le chiffrement de la base locale (SQLCipher) puis passer useSQLCipher à true.
    ['expo-sqlite', { useSQLCipher: false }],
    ['expo-notifications', { color: '#0B3366' }],
    ['expo-local-authentication', { faceIDPermission: 'Afyabora protège vos données de santé.' }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000',
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
