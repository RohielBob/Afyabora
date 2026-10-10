// Ticket L2-09 : logique de la chronologie (sans interface).
import { DEFAULT_THRESHOLDS } from '@glyka/shared';
import type { LocalEvent } from '@/features/events';
import type { LocalMeasurement } from '@/features/measurements';
import {
  TIMELINE_FILTERS,
  fromEvent,
  fromMeasurement,
  groupByDay,
  matchesFilter,
  shortBatchId,
  windowBounds,
  type TimelineItem,
} from '../timeline';

const local = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).toISOString();

const measurementRow = (
  id: string,
  at: string,
  mgDl = 120,
  extra: Partial<LocalMeasurement> = {},
): LocalMeasurement => ({
  id,
  value_mgdl: mgDl,
  original_value: mgDl,
  original_unit: 'MG_DL',
  measured_at: at,
  context: 'FASTING',
  source: 'MANUAL',
  import_batch_id: null,
  note: null,
  confirmed_unusual: 0,
  client_updated_at: at,
  updated_at: at,
  deleted_at: null,
  pending_sync: 1,
  ...extra,
});

const eventRow = (id: string, at: string, type: LocalEvent['type']): LocalEvent => ({
  id,
  type,
  occurred_at: at,
  label: type === 'MEAL' ? 'Déjeuner' : type === 'ACTIVITY' ? 'Marche' : 'Insuline (déclarée)',
  details: null,
  duration_minutes: type === 'ACTIVITY' ? 30 : null,
  client_updated_at: at,
  updated_at: at,
  deleted_at: null,
  pending_sync: 0,
});

const items: TimelineItem[] = [
  fromMeasurement(measurementRow('m-normale', local(10, 8), 120)),
  fromMeasurement(measurementRow('m-tres-haute', local(9, 21), 320)),
  fromMeasurement(measurementRow('m-tres-basse', local(9, 7), 48)),
  fromEvent(eventRow('e-repas', local(10, 12, 30), 'MEAL')),
  fromEvent(eventRow('e-marche', local(9, 18), 'ACTIVITY')),
  fromEvent(eventRow('e-traitement', local(8, 22), 'TREATMENT')),
];

describe('conversion des lignes locales', () => {
  it('mesure : instant, valeur, provenance, lot d’import, en attente d’envoi', () => {
    const item = fromMeasurement(
      measurementRow('m', local(10, 8), 140, { source: 'IMPORT', import_batch_id: 'abc' }),
    );
    expect(item).toMatchObject({
      kind: 'measurement',
      at: new Date(2026, 9, 10, 8).getTime(),
      mgDl: 140,
      source: 'IMPORT',
      importBatchId: 'abc',
      pendingSync: true,
    });
  });

  it('événement : type, libellé, durée', () => {
    expect(fromEvent(eventRow('e', local(9, 18), 'ACTIVITY'))).toMatchObject({
      kind: 'event',
      type: 'ACTIVITY',
      label: 'Marche',
      durationMinutes: 30,
      pendingSync: false,
    });
  });
});

describe('filtres (CA : « Repas » n’affiche que des repas)', () => {
  const ids = (filter: (typeof TIMELINE_FILTERS)[number]) =>
    items.filter((i) => matchesFilter(i, filter, DEFAULT_THRESHOLDS)).map((i) => i.id);

  it('tout, glycémie, repas, activité, traitements', () => {
    expect(ids('all')).toHaveLength(6);
    expect(ids('glucose')).toEqual(['m-normale', 'm-tres-haute', 'm-tres-basse']);
    expect(ids('MEAL')).toEqual(['e-repas']);
    expect(ids('ACTIVITY')).toEqual(['e-marche']);
    expect(ids('TREATMENT')).toEqual(['e-traitement']);
  });

  it('alertes : mesures très basses ou très hautes (seuils du patient)', () => {
    expect(ids('alerts')).toEqual(['m-tres-haute', 'm-tres-basse']);
    const own = { veryLowMgDl: 60, targetMinMgDl: 80, targetMaxMgDl: 110, veryHighMgDl: 115 };
    expect(items.filter((i) => matchesFilter(i, 'alerts', own)).map((i) => i.id)).toEqual([
      'm-normale', // 120 > 115 avec ces seuils
      'm-tres-haute',
      'm-tres-basse',
    ]);
  });
});

describe('groupement par jour (CA : du plus récent au plus ancien)', () => {
  it('sections du plus récent au plus ancien, et dans chaque jour aussi', () => {
    const sections = groupByDay([...items].reverse());
    expect(sections.map((s) => s.key)).toEqual(['2026-10-10', '2026-10-09', '2026-10-08']);
    expect(sections[0]?.items.map((i) => i.id)).toEqual(['e-repas', 'm-normale']);
    expect(sections[1]?.items.map((i) => i.id)).toEqual([
      'm-tres-haute',
      'e-marche',
      'm-tres-basse',
    ]);
    expect(sections[0]?.day).toBe(new Date(2026, 9, 10).getTime());
  });

  it('jours du calendrier local : 23 h 50 et 0 h 10 sont deux jours', () => {
    const sections = groupByDay([
      fromMeasurement(measurementRow('a', local(9, 23, 50))),
      fromMeasurement(measurementRow('b', local(10, 0, 10))),
    ]);
    expect(sections.map((s) => s.key)).toEqual(['2026-10-10', '2026-10-09']);
  });

  it('même instant : la mesure avant l’événement (ordre stable)', () => {
    const at = local(10, 8);
    const sections = groupByDay([
      fromEvent(eventRow('e', at, 'MEAL')),
      fromMeasurement(measurementRow('m', at)),
    ]);
    expect(sections[0]?.items.map((i) => i.kind)).toEqual(['measurement', 'event']);
  });

  it('rien à montrer : aucune section', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('fenêtres de chargement', () => {
  const now = new Date(2026, 9, 10, 9, 17);

  it('1 page = 30 jours, aujourd’hui compris, jusqu’à demain minuit', () => {
    const { fromIso, toIso } = windowBounds(1, now);
    expect(new Date(fromIso)).toEqual(new Date(2026, 8, 11)); // 11 sept. minuit
    expect(new Date(toIso)).toEqual(new Date(2026, 9, 11)); // 11 oct. minuit
  });

  it('2 pages = 60 jours', () => {
    expect(new Date(windowBounds(2, now).fromIso)).toEqual(new Date(2026, 7, 12));
  });
});

it('lot d’import court et lisible', () => {
  expect(shortBatchId('3f2a1c9e-1111-4111-8111-111111111111')).toBe('3F2A1C');
});
