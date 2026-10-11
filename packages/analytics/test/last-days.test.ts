// L8-11 : analyse des « N derniers jours » prête à afficher, la même pour l'API et le téléphone.
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@glyka/shared';
import { analysisWindow, analyze, analyzeLastDays, DISCLAIMER_FR, lastDaysPeriod } from '../src';
import { DAY, EXPECTED, REFERENCE_PERIOD, referenceDataset } from './reference/reference-data';

/** Dimanche 4 octobre 2026, 23:30 à Kinshasa : la semaine de référence est « les 7 derniers jours ». */
const NOW = Date.UTC(2026, 9, 4, 22, 30);

describe('analysisWindow : ce qu’il faut lire dans la base', () => {
  it('7 jours : la période et les 7 jours d’avant (comparaison)', () => {
    const w = analysisWindow(7, NOW);
    expect(new Date(w.from).toISOString()).toBe('2026-09-20T23:00:00.000Z');
    expect(new Date(w.to).toISOString()).toBe('2026-10-04T23:00:00.000Z');
  });

  it.each([7, 14, 30, 90])('%i jours : deux fois la période, finit à minuit ce soir', (days) => {
    const w = analysisWindow(days, NOW, 'Europe/Paris');
    const p = lastDaysPeriod(days, NOW, 'Europe/Paris');
    expect(w.to).toBe(p.to);
    expect(p.from - w.from).toBe(p.to - p.from);
    expect(Math.round((w.to - w.from) / DAY)).toBe(2 * days);
  });
});

describe('analyzeLastDays : la semaine de référence', () => {
  const result = analyzeLastDays(referenceDataset(), 7, { now: NOW });

  it('période des 7 derniers jours, en UTC', () => {
    expect(result.period).toEqual({
      from: new Date(REFERENCE_PERIOD.from).toISOString(),
      to: new Date(REFERENCE_PERIOD.to).toISOString(),
    });
  });

  it('mêmes chiffres que le moteur, observations avec leurs phrases, avertissement', () => {
    expect(result.stats).toMatchObject({ count: 20, timeInRangePct: 70, meanMgDl: 141.25 });
    expect(result.previousStats).toMatchObject(EXPECTED.previousStats);
    expect(result.quality).toEqual(EXPECTED.quality);
    expect(result.insights).toEqual(
      EXPECTED.insights.map((insight, i) => ({ ...insight, text: EXPECTED.sentences[i] })),
    );
    expect(result.disclaimer).toBe(DISCLAIMER_FR);
  });

  it('exactement analyze() sur la même période (aucun calcul en plus)', () => {
    const engine = analyze(referenceDataset(), REFERENCE_PERIOD, { now: NOW });
    expect(result.stats).toEqual(engine.stats);
    expect(result.previousStats).toEqual(engine.previousStats);
    expect(result.quality).toEqual(engine.quality);
    expect(result.insights.map(({ text: _text, ...insight }) => insight)).toEqual(engine.insights);
  });

  it('seuils par défaut si non donnés ; seuils du patient sinon', () => {
    const byDefault = analyzeLastDays(referenceDataset(), 7, {
      now: NOW,
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(byDefault).toEqual(result);
    const mine = analyzeLastDays(referenceDataset(), 7, {
      now: NOW,
      thresholds: { veryLowMgDl: 60, targetMinMgDl: 80, targetMaxMgDl: 160, veryHighMgDl: 220 },
    });
    expect(mine.stats!.timeInRangePct).toBe(50);
  });

  it('sous 10 mesures : pas de statistiques ni d’observations, qualité et avertissement quand même', () => {
    const few = analyzeLastDays(referenceDataset().slice(0, 9), 7, { now: NOW });
    expect(few).toMatchObject({ stats: null, previousStats: null, insights: [] });
    expect(few.quality.analyzable).toBe(false);
    expect(few.disclaimer).toBe(DISCLAIMER_FR);
  });
});
