// Adresse de l'API. Ordre de priorité :
//  1. EXPO_PUBLIC_API_URL (fichier apps/mobile/.env ou variable d'environnement) : toujours prioritaire ;
//  2. en développement sur un VRAI téléphone (Expo Go) : l'adresse IP du PC qui fait tourner Expo,
//     lue dans `hostUri` (ex. « 192.168.1.20:8081 » → http://192.168.1.20:3000) ;
//  3. dans le navigateur : http://localhost:3000 ;
//  4. sinon (émulateur Android) : la valeur d'app.config.ts (http://10.0.2.2:3000 = le PC vu de l'émulateur).
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 3000;

function devHostUrl(): string | null {
  const hostUri = Constants.expoConfig?.hostUri; // « IP:port » du serveur Expo
  const host = hostUri?.split(':')[0];
  if (!__DEV__ || !host || host === 'localhost' || host === '127.0.0.1') return null;
  return `http://${host}:${API_PORT}`;
}

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'web' ? `http://localhost:${API_PORT}` : null) ??
  devHostUrl() ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  `http://10.0.2.2:${API_PORT}`;
