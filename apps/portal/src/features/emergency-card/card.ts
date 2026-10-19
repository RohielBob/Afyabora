// Page publique de la carte d'urgence (L6-05, CDC F10) : la LOGIQUE, sans interface (testée dans
// __tests__/card.test.tsx). Cette page s'ouvre en scannant le QR d'urgence du patient, sur n'importe quel
// téléphone, SANS compte.
//  - Le jeton est dans l'adresse (`/e/<jeton>`) : il est lu une fois, puis retiré de l'adresse affichée
//    (il ne reste pas dans l'historique du téléphone du secouriste).
//  - La carte n'est demandée au serveur qu'APRÈS « Je suis un professionnel de santé ou un secouriste » :
//    l'ouverture est alors journalisée et le patient averti (côté serveur).
//  - La réponse est vérifiée avec le schéma de @glyka/shared, qui refuse tout champ en plus : jamais de
//    donnée inattendue à l'écran.
//  - Glycémie : la valeur seule, en mg/dL et en g/L ; jamais d'état en couleur (la page n'en juge pas).
import {
  EMERGENCY_CARD_FIELDS,
  emergencyCardPublicSchema,
  formatGlucose,
  type EmergencyCardField,
  type EmergencyCardPublic,
} from '@glyka/shared';
import { api, ApiError } from '@/lib/api-client';

/** Forme d'un jeton de QR d'urgence (32 octets en base64url) : sinon, la page ne demande rien. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isEmergencyToken(value: string | undefined): value is string {
  return !!value && TOKEN_PATTERN.test(value);
}

/** GET /e/:token (public). */
export async function fetchEmergencyCard(token: string): Promise<EmergencyCardPublic> {
  return emergencyCardPublicSchema.parse(
    await api(`/e/${encodeURIComponent(token)}`, { auth: false }),
  );
}

/** Pourquoi la carte ne s'affiche pas. */
export type CardProblem = 'unavailable' | 'tooMany' | 'busy' | 'network' | 'error';

export function cardProblem(error: unknown): CardProblem {
  if (!(error instanceof ApiError)) return 'error';
  if (error.status === 0) return 'network';
  if (error.status === 404) return 'unavailable';
  if (error.status === 429) return 'tooMany';
  if (error.status === 503) return 'busy';
  return 'error';
}

/** Une ligne de la carte : le champ et le texte à afficher. */
export interface CardLine {
  field: EmergencyCardField;
  text: string;
}

/** « 132 mg/dL · 1,32 g/L » : les deux unités les plus courantes, pour éviter toute erreur de lecture. */
export function glucoseText(mgDl: number): string {
  return `${formatGlucose(mgDl, 'MG_DL')} · ${formatGlucose(mgDl, 'G_L')}`;
}

/** Les champs renseignés, dans l'ordre de la carte (le nom est affiché à part, en titre). */
export function cardLines(card: EmergencyCardPublic): CardLine[] {
  return EMERGENCY_CARD_FIELDS.filter((field) => field !== 'fullName').flatMap((field) => {
    const value = card[field];
    if (value === undefined || value === '') return [];
    const text = field === 'lastKnownGlucoseMgDl' ? glucoseText(value as number) : String(value);
    return [{ field, text }];
  });
}

/** Numéro composable pour un lien « tel: » (chiffres et « + » seulement). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** « 19 octobre 2026 à 08:30 » (heure du téléphone qui lit la carte). */
export function updatedText(iso: string): { date: string; time: string } {
  const at = new Date(iso);
  return {
    date: at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    time: at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  };
}
