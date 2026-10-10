// Après une connexion réussie : décider où aller et enregistrer les jetons.
// L1-06 : enregistrement des jetons dans le stockage sécurisé du téléphone (Keystore / Keychain).
// TODO(L1-07) : session au démarrage, rafraîchissement automatique, déconnexion (vider la base locale, ADR-0004).
import { clearTokens, saveTokens } from '@/lib/secure-storage';
import type { LoginResponse } from './api';

export type LoginDestination = 'onboarding' | 'home' | 'notPatient';

/**
 * L'application mobile est réservée aux patients. Un compte médecin ou administrateur reçoit un message
 * l'orientant vers le portail web, et ses jetons ne sont PAS conservés sur le téléphone.
 */
export async function completeLogin(response: LoginResponse): Promise<LoginDestination> {
  if (response.user.role !== 'PATIENT') {
    await clearTokens();
    return 'notPatient';
  }
  await saveTokens(response.accessToken, response.refreshToken);
  return response.user.profileCompleted ? 'home' : 'onboarding';
}
