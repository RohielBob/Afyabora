// Ticket L5-12 : mélange de la chronologie du dossier partagé (fonctions pures, sans base).
import { describe, expect, it } from 'vitest';
import {
  comesFirst,
  eventEntry,
  measurementEntry,
  mergeTimeline,
  type TimelineEntry,
} from '../src/modules/doctor/timeline';

const T = { veryLowMgDl: 60, targetMinMgDl: 80, targetMaxMgDl: 160, veryHighMgDl: 240 };
const at = (minute: number) => new Date(Date.UTC(2026, 9, 18, 8, minute));
const m = (id: string, minute: number, mgDl = 120) =>
  measurementEntry(
    { id, measuredAt: at(minute), valueMgDl: mgDl, context: 'AFTER_MEAL', source: 'IMPORT' },
    T,
  );
const e = (id: string, minute: number) =>
  eventEntry({ id, occurredAt: at(minute), type: 'TREATMENT', label: 'Insuline' });

describe('lignes de la chronologie', () => {
  it('mesure : valeur, état selon les seuils DONNÉS, provenance, contexte en code', () => {
    expect(m('a', 1, 70).item).toEqual({
      kind: 'MEASUREMENT',
      at: at(1).toISOString(),
      label: 'AFTER_MEAL',
      valueMgDl: 70,
      state: 'LOW',
      source: 'IMPORT',
    });
    expect(m('a', 1, 59).item.state).toBe('VERY_LOW');
    expect(m('a', 1, 161).item.state).toBe('HIGH');
    expect(m('a', 1, 241).item.state).toBe('VERY_HIGH');
  });

  it('évènement : son type, son libellé, sans valeur ni état ni provenance', () => {
    expect(e('b', 2).item).toEqual({
      kind: 'TREATMENT',
      at: at(2).toISOString(),
      label: 'Insuline',
      valueMgDl: null,
      state: null,
      source: null,
    });
  });
});

describe('mergeTimeline', () => {
  it('plus récent d’abord ; à la même heure, identifiant décroissant', () => {
    const lists: TimelineEntry[][] = [
      [m('m3', 30), m('m1', 10)],
      [e('e9', 20), e('e2', 10)],
    ];
    expect(mergeTimeline(lists, 10).page.map((x) => x.id)).toEqual(['m3', 'e9', 'm1', 'e2']);
    expect(comesFirst(m('b', 5), m('a', 5))).toBe(true);
    expect(comesFirst(m('a', 5), m('a', 5))).toBe(false);
  });

  it('garde `limit` lignes ; `last` = la dernière gardée seulement s’il en reste', () => {
    const lists = [[m('m2', 2), m('m1', 1)], [e('e3', 3)]];
    const cut = mergeTimeline(lists, 2);
    expect(cut.page.map((x) => x.id)).toEqual(['e3', 'm2']);
    expect(cut.last?.id).toBe('m2');
    expect(mergeTimeline(lists, 3).last).toBeNull();
    expect(mergeTimeline([[], []], 5)).toEqual({ page: [], last: null });
  });
});
