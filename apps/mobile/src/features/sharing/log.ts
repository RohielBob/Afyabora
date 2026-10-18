// « Qui a consulté mes données » (L5-09, CDC F7 « Journal d'accès ») : les lignes du journal (GET /shares/log,
// L5-05) regroupées en VISITES, une par partage scanné : qui, quand, combien de temps, comment l'accès a
// pris fin. Fonctions pures, testées sans écran (__tests__/log.test.ts).
//  - Une visite commence au scan (SHARE_CLAIMED) et finit à SHARE_EXPIRED ou SHARE_REVOKED ; sans fin
//    connue, elle est « en cours ». Les consultations (SHARE_VIEWED) et rapports téléchargés
//    (REPORT_DOWNLOADED) de la même session y sont comptés.
//  - Un QR arrêté AVANT tout scan n'a jamais donné d'accès : il n'apparaît pas (ce n'est pas une visite).
//  - Accès d'urgence (EMERGENCY_VIEWED, sans session) : une ligne à part, sans nom.
//  - Nom (décision d'équipe, L5-05) : « Dr Prénom Nom » ; compte médecin supprimé : « Médecin » (textes
//    `share.log.doctor` et `share.log.unknownDoctor`, choisis par l'écran).
import type { AccessLogEntry } from '@glyka/shared';

export interface ShareVisit {
  kind: 'share';
  /** Clé stable (identifiant de la session). */
  key: string;
  /** Nom du médecin tel que renvoyé par le serveur (« Prénom Nom ») ; null si le compte n'existe plus. */
  doctorName: string | null;
  /** Scan (ISO). */
  startedAt: string;
  /** Fin (ISO), ou null si l'accès est encore ouvert. */
  endedAt: string | null;
  end: 'expired' | 'revoked' | null;
  /** Nombre de consultations enregistrées. */
  views: number;
  reportDownloads: number;
}

export interface EmergencyVisit {
  kind: 'emergency';
  key: string;
  at: string;
}

export type Visit = ShareVisit | EmergencyVisit;

/** Date de début d'une visite (pour le tri). */
const startOf = (visit: Visit) => (visit.kind === 'share' ? visit.startedAt : visit.at);

/** Lignes du journal (toutes pages confondues, dans n'importe quel ordre) ⇒ visites, la plus récente d'abord. */
export function buildVisits(entries: readonly AccessLogEntry[]): Visit[] {
  const bySession = new Map<string, AccessLogEntry[]>();
  const visits: Visit[] = [];
  const seen = new Set<string>(); // une même ligne reçue deux fois (pages rechargées) ne compte qu'une fois
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    if (entry.action === 'EMERGENCY_VIEWED') {
      visits.push({ kind: 'emergency', key: entry.id, at: entry.at });
    } else if (entry.sessionId) {
      const list = bySession.get(entry.sessionId) ?? [];
      list.push(entry);
      bySession.set(entry.sessionId, list);
    }
  }
  for (const [sessionId, list] of bySession) {
    const claim = list.find((e) => e.action === 'SHARE_CLAIMED');
    if (!claim) continue; // QR jamais scanné : pas de visite
    const ending = list
      .filter((e) => e.action === 'SHARE_EXPIRED' || e.action === 'SHARE_REVOKED')
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
    visits.push({
      kind: 'share',
      key: sessionId,
      doctorName: claim.actorName ?? list.find((e) => e.actorName)?.actorName ?? null,
      startedAt: claim.at,
      endedAt: ending?.at ?? null,
      end: ending ? (ending.action === 'SHARE_EXPIRED' ? 'expired' : 'revoked') : null,
      views: list.filter((e) => e.action === 'SHARE_VIEWED').length,
      reportDownloads: list.filter((e) => e.action === 'REPORT_DOWNLOADED').length,
    });
  }
  return visits.sort((a, b) => Date.parse(startOf(b)) - Date.parse(startOf(a)));
}

/** Durée réelle de l'accès en minutes (arrondie, au moins 1), ou null s'il est encore ouvert. */
export function visitMinutes(visit: ShareVisit): number | null {
  if (!visit.endedAt) return null;
  const ms = Date.parse(visit.endedAt) - Date.parse(visit.startedAt);
  return Math.max(1, Math.round(ms / 60_000));
}

/** « 12 min », « 1 h », « 1 h 05 ». */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}
