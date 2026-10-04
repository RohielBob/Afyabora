import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Glyka',
  slug: 'glyka',
  scheme: 'glyka',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png', // TODO(L7-04)
  splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#0B6E6E' }, // TODO(L7-04)
  android: {
    package: 'com.glyka.app',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0B6E6E' },
    permissions: ['USE_BIOMETRIC', 'POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM'],
  },
  ios: { bundleIdentifier: 'com.glyka.app', supportsTablet: false },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    // TODO(L8-02) : valider le chiffrement de la base locale (SQLCipher) puis passer useSQLCipher à true.
    ['expo-sqlite', { useSQLCipher: false }],
    ['expo-notifications', { color: '#0B6E6E' }],
    ['expo-local-authentication', { faceIDPermission: 'Glyka protège vos données de santé.' }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000',
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
