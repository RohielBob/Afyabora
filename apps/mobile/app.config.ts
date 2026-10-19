import type { ExpoConfig } from 'expo/config';

// Identité : nom affiché = Afyabora. Les identifiants techniques (slug, scheme, package Android,
// bundle iOS) restent « glyka » pour l'instant — voir docs/adr/0007-nom-afyabora-identifiants-internes.md.
const config: ExpoConfig = {
  name: 'Afyabora',
  // Compte Expo propriétaire du projet EAS (L0-11) : celui qui construit l'APK doit en être membre.
  owner: 'iron-hawk48',
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
    ['expo-notifications', { color: '#E4002B' }], // couleur d'accent des notifications Android (ADR-0008)
    ['expo-local-authentication', { faceIDPermission: 'Afyabora protège vos données de santé.' }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000',
    // Projet EAS @iron-hawk48/glyka (L0-11, construction de l'APK). Pas un secret : il identifie seulement
    // le projet chez Expo. EAS_PROJECT_ID permet de viser un autre projet sans modifier ce fichier.
    eas: { projectId: process.env.EAS_PROJECT_ID ?? '7a2f9e36-296a-47d5-a46f-a5c7dd598ef8' },
  },
};

export default config;
