// « Mes patients partagés » (L5-11) : ce que la liste affiche pour une session, en règles pures testées sans
// navigateur (__tests__/view.test.ts). Les heures viennent du SERVEUR (`expiresAt`, `claimedAt`) et sont
// affichées en heure absolue (« jusqu'à 18:12 ») : l'horloge de l'ordinateur ne peut pas les fausser.
import {
  SHARE_CATEGORIES,
  type DoctorSessionDto,
  type QualityLevel,
  type ShareCategory,
} from '@glyka/shared';
import { fill, fr } from '@/i18n/fr';

export type StatusTone = 'active' | 'ended';

/** État de l'accès : libellé, ton (couleur + icône côté écran) et phrase sur l'heure. */
export function statusView(
  session: Pick<DoctorSessionDto, 'status' | 'expiresAt'>,
  now: Date,
): { tone: StatusTone; label: string; when: string | null } {
  const end = session.expiresAt ? when(session.expiresAt, now) : null;
  switch (session.status) {
    case 'ACTIVE':
      return {
        tone: 'active',
        label: fr.patients.status.ACTIVE,
        when: end ? fill(fr.patients.until, { when: end }) : null,
      };
    case 'REVOKED':
      return { tone: 'ended', label: fr.patients.status.REVOKED, when: null };
    default:
      return {
        tone: 'ended',
        label: fr.patients.status.EXPIRED,
        when: end ? fill(fr.patients.endedAt, { when: end }) : null,
      };
  }
}

/** « 18:12 » aujourd'hui, sinon « 17 oct. à 18:12 » (heure de l'ordinateur du médecin). */
export function when(iso: string, now: Date): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (at.toDateString() === now.toDateString()) return time;
  const date = at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return fill(fr.patients.dateTime, { date, time });
}

/** Dernière mesure : « aujourd'hui à 08:12 », « le 17 oct. à 08:12 », ou rien (non partagée / accès fini). */
export function lastMeasurementText(session: DoctorSessionDto, now: Date): string | null {
  if (session.status !== 'ACTIVE' || !session.categories.includes('GLUCOSE_HISTORY')) return null;
  if (!session.lastMeasurementAt) return fr.patients.noMeasurement;
  const at = new Date(session.lastMeasurementAt);
  const time = at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return at.toDateString() === now.toDateString()
    ? fill(fr.patients.lastToday, { time })
    : fill(fr.patients.lastOn, {
        date: at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        time,
      });
}

/** Qualité des données : libellé et ton (icône + texte côté écran, jamais la couleur seule). */
export function qualityView(level: QualityLevel, score: number): { label: string; a11y: string } {
  const label = fr.patients.quality[level];
  return { label, a11y: fill(fr.patients.qualityA11y, { label, score }) };
}

/** Catégories dans l'ordre du contrat (stable d'une ligne à l'autre). */
export function orderedCategories(categories: readonly ShareCategory[]): ShareCategory[] {
  return SHARE_CATEGORIES.filter((c) => categories.includes(c));
}
