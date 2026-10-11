// L3-06 : résumé de la période en langage clair (IA-3), gabarit du moteur.
import { describe, expect, it } from 'vitest';
import {
  analyze,
  analyzeLastDays,
  joinFr,
  renderSummaryFr,
  summaryFacts,
  type Insight,
  type SummaryFacts,
} from '../src';
import {
  EXPECTED,
  REFERENCE_NOW,
  REFERENCE_PERIOD,
  referenceDataset,
} from './reference/reference-data';

const reference = analyze(referenceDataset(), REFERENCE_PERIOD, { now: REFERENCE_NOW });

describe('faits du résumé', () => {
  it('semaine de référence : chiffres affichés, points par gravité, créneau, jours manquants', () => {
    expect(summaryFacts(reference, 7)).toEqual({
      kind: 'analysis',
      days: 7,
      count: 20,
      qualityLevel: 'GOOD',
      qualityScore: 86,
      inRange: 70,
      above: 20,
      below: 10,
      previousInRange: 50,
      points: ['REPEATED_HYPO', 'HIGH_STREAK', 'TIME_OF_DAY_PATTERN'],
      slots: ['EVENING'],
      missingDays: 2,
      daysInPeriod: 7,
    } satisfies SummaryFacts);
  });

  it('moins de 10 mesures : « insuffisant »', () => {
    const few = analyze(referenceDataset().slice(0, 9), REFERENCE_PERIOD, { now: REFERENCE_NOW });
    expect(summaryFacts(few, 7)).toEqual({ kind: 'insufficient', days: 7 });
  });

  it('chaque type de point une seule fois, l’alerte d’abord, les informations ignorées', () => {
    const insights: Insight[] = [
      { type: 'MISSING_DATA', severity: 'INFO', facts: { daysWithoutData: 1 }, evidenceIds: [] },
      { type: 'ANOMALY', severity: 'ATTENTION', facts: { count: 1 }, evidenceIds: [] },
      {
        type: 'TIME_OF_DAY_PATTERN',
        severity: 'INFO',
        facts: { slot: 'EVENING' },
        evidenceIds: [],
      },
      { type: 'TIME_OF_DAY_PATTERN', severity: 'INFO', facts: { slot: 'NIGHT' }, evidenceIds: [] },
      { type: 'REPEATED_HYPO', severity: 'ALERT', facts: { count: 2 }, evidenceIds: [] },
    ];
    const facts = summaryFacts({ ...reference, insights }, 7);
    expect(facts).toMatchObject({
      points: ['REPEATED_HYPO', 'ANOMALY', 'TIME_OF_DAY_PATTERN'],
      slots: ['EVENING', 'NIGHT'],
      missingDays: 1,
      previousInRange: null,
    });
  });
});

describe('résumé en français (gabarit)', () => {
  it('semaine de référence : texte exact, écrit à la main', () => {
    expect(renderSummaryFr(summaryFacts(reference, 7))).toBe(EXPECTED.summary);
  });

  it('analyzeLastDays (API et téléphone) renvoie ce résumé', () => {
    const r = analyzeLastDays(referenceDataset(), 7, { now: REFERENCE_NOW - 30 * 60_000 });
    expect(r.summary).toBe(EXPECTED.summary);
  });

  it('pas assez de mesures', () => {
    expect(renderSummaryFr({ kind: 'insufficient', days: 30 })).toBe(
      'Pas encore assez de mesures sur les 30 derniers jours pour une analyse fiable (il en faut au moins 10).',
    );
  });

  it('rien de particulier, pas de comparaison, aucun jour manquant', () => {
    const text = renderSummaryFr({
      kind: 'analysis',
      days: 14,
      count: 42,
      qualityLevel: 'PARTIAL',
      qualityScore: 64,
      inRange: 81,
      above: 15,
      below: 4,
      previousInRange: null,
      points: [],
      slots: [],
      missingDays: null,
      daysInPeriod: 14,
    });
    expect(text).toBe(
      'Sur les 14 derniers jours, 42 mesures ont été analysées (qualité des données : partielle, 64/100). ' +
        'Elles étaient dans la cible 81 % du temps, au-dessus 15 % et en dessous 4 %. ' +
        "Aucun point particulier n'a été relevé sur cette période.",
    );
  });

  it('plusieurs créneaux : « le soir et la nuit »', () => {
    const facts = summaryFacts(reference, 7) as Extract<SummaryFacts, { kind: 'analysis' }>;
    expect(
      renderSummaryFr({ ...facts, points: ['TIME_OF_DAY_PATTERN'], slots: ['EVENING', 'NIGHT'] }),
    ).toContain(
      'Points à examiner avec votre professionnel de santé : des valeurs hautes plus fréquentes le soir et la nuit.',
    );
  });

  it('énumérations : « a », « a et b », « a, b et c »', () => {
    expect(joinFr([])).toBe('');
    expect(joinFr(['a'])).toBe('a');
    expect(joinFr(['a', 'b'])).toBe('a et b');
    expect(joinFr(['a', 'b', 'c'])).toBe('a, b et c');
  });

  it('jamais de diagnostic, de dose, de traitement ni de cause', () => {
    const texts = [
      renderSummaryFr(summaryFacts(reference, 7)),
      renderSummaryFr({ kind: 'insufficient', days: 7 }),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(
        /diagnos|dose|insuline|traitement|médicament|il faut|à cause|parce que/i,
      );
    }
  });
});
