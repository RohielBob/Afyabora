// Ticket L6-01 : données et textes du rapport « Préparer ma consultation » (sans base, sans PDF).
// Le point central (CDC F9) : les chiffres du rapport sont ceux du moteur d'analyse, comme le tableau de bord.
import { analyzeLastDays, displayPercents } from '@glyka/analytics';
import { describe, expect, it } from 'vitest';
import {
  buildReport,
  findEpisodes,
  type ReportInput,
  type ReportMeasurement,
} from '../src/modules/reports/report-data';
import {
  dateShort,
  listDays,
  periodRange,
  plural,
  reportText,
  reportView,
} from '../src/modules/reports/report-view';
import { DAY, HOUR, NOW, PATIENT, fixtureMeasurements } from './support/report-fixture';

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  patient: PATIENT,
  measurements: fixtureMeasurements(30),
  days: 30,
  now: NOW,
  author: { kind: 'PATIENT' },
  ...over,
});

describe('chiffres du rapport = chiffres du moteur (tableau de bord)', () => {
  it.each([14, 30, 90] as const)('%i jours : même analyse, même répartition', (days) => {
    const measurements = fixtureMeasurements(days);
    const data = buildReport(input({ days, measurements }));
    const dashboard = analyzeLastDays(
      measurements.map((m) => ({ id: m.id, at: m.at, mgDl: m.mgDl })),
      days,
      { now: NOW, thresholds: PATIENT.thresholds, timeZone: PATIENT.timezoneOffsetMinutes },
    );
    expect(data.analysis).toEqual(dashboard);
    expect(data.percents).toEqual(displayPercents(dashboard.stats!));
    expect(data.measurements).toHaveLength(dashboard.stats!.count);
    // Les jours sans mesure du rapport sont exactement ceux de la qualité des données.
    expect(data.daysWithoutData).toHaveLength(
      dashboard.quality.daysInPeriod - dashboard.quality.daysWithData,
    );
    // Les valeurs inhabituelles sont exactement les preuves de l'observation du moteur.
    const anomaly = dashboard.insights.find((i) => i.type === 'ANOMALY');
    expect(data.unusual.map((m) => m.id)).toEqual(
      [...(anomaly?.evidenceIds ?? [])].sort(
        (a, b) =>
          measurements.find((m) => m.id === a)!.at - measurements.find((m) => m.id === b)!.at,
      ),
    );
  });

  it('fuseau DU patient (ici UTC+3, pas le fuseau par défaut) : même période et mêmes jours que l’application', () => {
    const patient = { ...PATIENT, timezoneOffsetMinutes: 180 };
    const measurements = fixtureMeasurements(30);
    const data = buildReport(input({ patient, measurements }));
    const dashboard = analyzeLastDays(
      measurements.map((m) => ({ id: m.id, at: m.at, mgDl: m.mgDl })),
      30,
      { now: NOW, thresholds: PATIENT.thresholds, timeZone: 180 },
    );
    expect(data.analysis).toEqual(dashboard);
    expect(data.analysis.period).not.toEqual(buildReport(input()).analysis.period);
    // Mesures du coucher : 20:00 UTC = 23:00 à UTC+3.
    expect(reportView(data).episodesBelow.rows[0]?.cells[1]).toBe('23:00');
  });

  it('chaque chiffre affiché vient de l’analyse (nombre, répartition, qualité, moyenne)', () => {
    const data = buildReport(input());
    const text = reportText(reportView(data));
    const { stats, quality } = data.analysis;
    expect(text).toContain(`Mesures : ${stats!.count}`);
    expect(text).toContain(
      `Dans la cible ${data.percents!.inRange} % · au-dessus ${data.percents!.above} % · en dessous ${data.percents!.below} %`,
    );
    expect(text).toContain(`Qualité des données : ${quality.score}/100`);
    expect(text).toContain(`${quality.daysWithData} jours avec au moins une mesure sur 30`);
    expect(text).toContain(
      `Moyenne : ${(Math.round(stats!.meanMgDl!) / 100).toFixed(2).replace('.', ',')} g/L`,
    );
    expect(text).toContain(data.analysis.summary); // le même résumé que l'application
  });
});

describe('épisodes', () => {
  const m = (h: number, mgDl: number): ReportMeasurement & { state: never } =>
    ({ id: `id-${h}`, at: h * HOUR, mgDl, context: 'OTHER' }) as never;
  const states = (values: [number, number][]) =>
    values.map(([h, mgDl]) => ({
      ...m(h, mgDl),
      state: (mgDl < 54
        ? 'VERY_LOW'
        : mgDl < 70
          ? 'LOW'
          : mgDl > 250
            ? 'VERY_HIGH'
            : mgDl > 180
              ? 'HIGH'
              : 'IN_RANGE') as never,
    }));

  it('mesures CONSÉCUTIVES du même côté = un épisode ; extrême et sévérité', () => {
    const { below, above } = findEpisodes(
      states([
        [1, 65],
        [2, 50],
        [3, 120],
        [4, 190],
        [5, 260],
        [6, 200],
        [7, 66],
        [8, 120],
      ]),
    );
    expect(below).toEqual([
      { side: 'below', start: 1 * HOUR, end: 2 * HOUR, count: 2, extremeMgDl: 50, severe: true },
      { side: 'below', start: 7 * HOUR, end: 7 * HOUR, count: 1, extremeMgDl: 66, severe: false },
    ]);
    expect(above).toEqual([
      { side: 'above', start: 4 * HOUR, end: 6 * HOUR, count: 3, extremeMgDl: 260, severe: true },
    ]);
    expect(findEpisodes([])).toEqual({ below: [], above: [] });
  });

  it('tableau : les plus récents d’abord, 10 au plus, les autres comptés ; heure du patient', () => {
    const data = buildReport(input({ days: 90, measurements: fixtureMeasurements(90) }));
    const view = reportView(data);
    expect(data.episodes.below.length).toBeGreaterThan(10);
    expect(view.episodesBelow.rows).toHaveLength(10);
    expect(view.episodesBelow.note).toBe(
      `… et ${data.episodes.below.length - 10} autres épisodes, plus anciens.`,
    );
    // Les mesures du coucher sont à 21:00 heure de Kinshasa (20:00 UTC).
    expect(view.episodesBelow.rows[0]?.cells[1]).toBe('21:00');
    // Du plus récent au plus ancien : la première ligne est le dernier épisode de la période.
    const latest = [...data.episodes.below].sort((a, b) => b.start - a.start);
    expect(view.episodesBelow.rows.map((r) => r.cells[0])).toEqual(
      latest.slice(0, 10).map((e) => dateShort(e.start, PATIENT.timezoneOffsetMinutes)),
    );
    const severe = view.episodesBelow.rows.find((r) => r.cells[4] === 'Très bas');
    expect(severe?.strong).toBe(true);
  });
});

describe('textes', () => {
  it('identité : prénom et nom, type, année ; ni date de naissance ni coordonnées', () => {
    const view = reportView(buildReport(input()));
    expect(view.patientName).toBe('Awa Mbuyi');
    expect(view.patientDetails).toBe('Diabète de type 1 · diagnostiqué en 2015');
    expect(Object.keys(PATIENT)).not.toContain('birthDate');
  });

  it('unité du patient partout, seuils compris (g/L, mg/dL, mmol/L)', () => {
    const gl = reportView(buildReport(input()));
    expect(gl.targetText).toBe(
      'Plage cible du patient : 0,75 – 1,75 g/L. Très bas : sous 0,60 g/L. Très haut : au-dessus de 2,40 g/L.',
    );
    const mg = reportView(buildReport(input({ patient: { ...PATIENT, preferredUnit: 'MG_DL' } })));
    expect(mg.targetText).toContain('75 – 175 mg/dL');
    expect(reportText(mg)).not.toMatch(/g\/L(?!.*mg)/);
    const mmol = reportView(
      buildReport(input({ patient: { ...PATIENT, preferredUnit: 'MMOL_L' } })),
    );
    expect(mmol.targetText).toContain('4,2 – 9,7 mmol/L');
    // Axe jusqu'à la valeur la plus haute (410 mg/dL = 22,8 mmol/L dans les données), par pas de 3.
    expect(mmol.chart.ticks).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24]);
  });

  it('période, génération et auteur : patient ou médecin', () => {
    const view = reportView(buildReport(input()));
    expect(view.periodText).toBe('Du 20 septembre au 19 octobre 2026 · 30 jours');
    // Période à cheval sur deux années : chaque date garde son année.
    expect(periodRange(Date.UTC(2025, 11, 20), Date.UTC(2026, 0, 2), 60)).toBe(
      'Du 20 décembre 2025 au 2 janvier 2026',
    );
    // Même mois : le mois une seule fois.
    expect(periodRange(Date.UTC(2026, 9, 6), Date.UTC(2026, 9, 19), 60)).toBe(
      'Du 6 au 19 octobre 2026',
    );
    expect(view.generatedText).toBe(
      "Généré le 19 octobre 2026 à 10:42 par l'application Afyabora, à la demande du patient.",
    );
    const doctor = reportView(
      buildReport(input({ author: { kind: 'DOCTOR', name: 'Aline Démo' } })),
    );
    expect(doctor.generatedText).toContain(
      "à la demande du Dr Aline Démo, avec l'accord du patient",
    );
  });

  it('points à examiner : descriptifs, avec les seuils dans l’unité, par gravité', () => {
    const view = reportView(
      buildReport(input({ days: 90, measurements: fixtureMeasurements(90) })),
    );
    expect(view.points.length).toBeGreaterThan(0);
    expect(view.points[0]).toMatch(/^Valeurs basses répétées : \d+ mesures sous 0,75 g\/L/);
    expect(view.points.some((p) => p.startsWith('Valeurs inhabituelles'))).toBe(true);
    // Jamais un diagnostic, une cause, une dose ou un conseil (le mot n'apparaît que dans l'avertissement).
    for (const point of view.points) {
      expect(point).not.toMatch(/diagnosti|dose|insuline|traitement|vous devez|il faut|à cause/i);
    }
    expect(view.disclaimer).toContain('ne constitue pas un diagnostic');
  });

  it('accord : 0 et 1 au singulier, au-delà au pluriel', () => {
    expect([0, 1, 2].map((n) => plural(n, 'mesure', 'mesures'))).toEqual([
      '0 mesure',
      '1 mesure',
      '2 mesures',
    ]);
  });

  it('jours sans mesure : listés (le mois une seule fois par mois), ou comptés s’ils sont nombreux', () => {
    const offset = PATIENT.timezoneOffsetMinutes;
    const day = (month: number, date: number) => Date.UTC(2026, month, date) - HOUR;
    expect(listDays([day(9, 2), day(9, 11), day(9, 20)], offset)).toBe('2, 11 et 20 octobre');
    expect(listDays([day(8, 30), day(9, 2), day(9, 5)], offset)).toBe(
      '30 septembre, 2 et 5 octobre',
    );
    expect(listDays([day(9, 2)], offset)).toBe('2 octobre');
    const view = reportView(buildReport(input()));
    expect(view.missingDaysText).toMatch(/^\d+ jours sans aucune mesure : .+\. Les analyses/);
  });

  it('moins de 10 mesures : pas de chiffres, un message clair ; le graphique garde les mesures', () => {
    const few = fixtureMeasurements(30).filter((m) => m.at > NOW - 2 * DAY);
    const view = reportView(buildReport(input({ measurements: few })));
    expect(view.insufficient).toMatch(
      /^Pas assez de mesures pour une analyse fiable : \d+ mesures/,
    );
    expect(view.keyFigures).toEqual([]);
    expect(view.distribution).toBeNull();
    expect(view.chart.points).toHaveLength(few.length);
    const none = reportView(buildReport(input({ measurements: [] })));
    expect(none.insufficient).toBe('Aucune mesure sur la période : pas de chiffres à analyser.');
    expect(none.quality.lines[0]).toBe('0 jour avec au moins une mesure sur 30.');
    expect(none.episodesBelow.explanation).toContain('0 épisode sur la période');
  });
});
