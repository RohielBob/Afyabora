// Empreinte digitale / reconnaissance du visage (expo-local-authentication).
// Le code de l'app reste toujours le moyen de secours : la biométrie n'est qu'un raccourci.
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type BiometricKind = 'face' | 'fingerprint' | 'other';

export interface BiometricSupport {
  /** Capteur présent ET au moins une empreinte / un visage enregistré dans le téléphone. */
  available: boolean;
  kind: BiometricKind;
}

export async function biometricSupport(): Promise<BiometricSupport> {
  if (Platform.OS === 'web') return { available: false, kind: 'other' };
  try {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const kind: BiometricKind = types.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
    )
      ? 'face'
      : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ? 'fingerprint'
        : 'other';
    return { available: hardware && enrolled, kind };
  } catch {
    return { available: false, kind: 'other' };
  }
}

/** Demande l'empreinte / le visage. Le code du téléphone n'est PAS proposé : c'est notre code qui sert de secours. */
export async function authenticateWithBiometrics(prompt: string, cancel: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      cancelLabel: cancel,
      disableDeviceFallback: true,
    });
    return result.success;
  } catch {
    return false;
  }
}
