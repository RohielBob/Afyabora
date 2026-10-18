// État de la synchronisation tel que l'écran l'affiche (L8-10, CDC F11) : fonction PURE, testée. Le
// bandeau de l'Accueil et l'écran « Synchronisation » affichent ce résultat ; ils ne décident de rien.
// Règle de l'interface : un état n'est JAMAIS exprimé par la couleur seule ⇒ toujours une icône ET un texte.
import type { SyncState } from './engine';

export type SyncTone = 'ok' | 'pending' | 'syncing' | 'offline' | 'problem';

/** Données en attente, par type (la phrase est construite par l'écran, au pluriel juste). */
export interface PendingSummary {
  measurements: number;
  events: number;
}

export interface SyncStatusView {
  tone: SyncTone;
  /** Clé i18n du titre (`sync.status.*`). */
  title: 'upToDate' | 'pending' | 'syncing' | 'offline' | 'problem' | 'session' | 'rejected';
  /** Données en attente (affichées si `total` > 0). */
  pending: PendingSummary & { total: number };
  /** Dernière synchronisation réussie (ISO) : affichée quand tout va bien. */
  lastSuccessAt: string | null;
  /** Prochain essai automatique (ISO) : affiché après un échec. */
  nextRetryAt: string | null;
  /** Bouton « Réessayer » (échec qui n'est pas un simple hors-ligne). */
  canRetry: boolean;
  /** Modifications refusées par le serveur, à revoir sur l'écran « Synchronisation ». */
  rejected: number;
}

export function syncStatusView(state: SyncState): SyncStatusView {
  const pending = {
    measurements: state.pendingMeasurements,
    events: state.pendingEvents,
    total: state.pendingCount,
  };
  const base = {
    pending,
    lastSuccessAt: null,
    nextRetryAt: null,
    canRetry: false,
    rejected: state.failedCount,
  };
  if (state.status === 'syncing') return { ...base, tone: 'syncing', title: 'syncing' };
  if (state.status === 'offline') {
    // CDC F11 : « Hors ligne : vos données sont enregistrées sur ce téléphone » + « 2 mesures en attente ».
    return { ...base, tone: 'offline', title: 'offline' };
  }
  if (state.status === 'error') {
    if (state.lastError === 'session') return { ...base, tone: 'problem', title: 'session' };
    return {
      ...base,
      tone: 'problem',
      title: 'problem',
      nextRetryAt: state.nextRetryAt,
      canRetry: true,
    };
  }
  if (pending.total > 0) return { ...base, tone: 'pending', title: 'pending' };
  // Tout est envoyé SAUF des modifications refusées : on ne dit pas « Tout est à jour » (ce serait faux).
  if (state.failedCount > 0) {
    return { ...base, tone: 'problem', title: 'rejected', lastSuccessAt: state.lastSuccessAt };
  }
  return { ...base, tone: 'ok', title: 'upToDate', lastSuccessAt: state.lastSuccessAt };
}

/** Heure ou date d'une synchronisation : « à 14:30 » aujourd'hui, sinon « le 12 octobre à 09:10 ». */
export function whenLabel(
  iso: string,
  now: Date,
  locale: string,
): { sameDay: boolean; time: string; date: string } {
  const at = new Date(iso);
  const sameDay = at.toDateString() === now.toDateString();
  return {
    sameDay,
    time: at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    date: at.toLocaleDateString(locale, { day: 'numeric', month: 'long' }),
  };
}

/** Traduction (i18next `t`) réduite à ce dont on a besoin : remplaçable dans les tests. */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * « 2 mesures en attente de synchronisation », « 1 événement en attente… », « 2 mesures et 1 événement en
 * attente… » ; null si rien n'attend.
 */
export function pendingPhrase(t: Translate, pending: PendingSummary): string | null {
  const measurements =
    pending.measurements > 0 ? t('sync.measurements', { count: pending.measurements }) : null;
  const events = pending.events > 0 ? t('sync.events', { count: pending.events }) : null;
  if (!measurements && !events) return null;
  const what =
    measurements && events
      ? t('sync.pendingBoth', { measurements, events })
      : (measurements ?? events);
  return t('sync.pendingLine', { what });
}

/**
 * Phrase complète (bandeau) : « Dernière synchronisation à 14:30 » / « … le 12 octobre à 09:10 » / « Pas
 * encore synchronisé… ». Valeur seule (sous le titre « Dernière synchronisation » de l'écran) : « Aujourd'hui
 * à 14:30 » / « Le 12 octobre à 09:10 » / « Jamais sur ce téléphone ».
 */
export function lastSyncPhrase(
  t: Translate,
  iso: string | null,
  now: Date,
  locale: string,
  form: 'sentence' | 'value' = 'sentence',
): string {
  const keys =
    form === 'sentence'
      ? { never: 'sync.never', today: 'sync.lastToday', on: 'sync.lastOn' }
      : {
          never: 'sync.screen.lastNever',
          today: 'sync.screen.lastToday',
          on: 'sync.screen.lastOn',
        };
  if (!iso) return t(keys.never);
  const when = whenLabel(iso, now, locale);
  return when.sameDay
    ? t(keys.today, { time: when.time })
    : t(keys.on, { date: when.date, time: when.time });
}

/**
 * « Nouvel essai automatique à 14:32 », ou « … dans quelques secondes » quand il a lieu dans moins d'une
 * minute (les premiers essais sont à 2 s, 4 s, 8 s… : l'heure affichée serait l'heure actuelle).
 */
export function nextRetryPhrase(t: Translate, iso: string, now: Date, locale: string): string {
  if (Date.parse(iso) - now.getTime() < 60_000) return t('sync.nextRetrySoon');
  return t('sync.nextRetry', { time: whenLabel(iso, now, locale).time });
}
