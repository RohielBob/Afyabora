// L3-02 : fuseau horaire du patient. Les créneaux et les jours se comptent à l'heure LOCALE du patient,
// heure d'été comprise. Les dates de changement d'heure 2026 viennent des règles légales, recalculées
// indépendamment (calendrier Python) : Union européenne, dernier dimanche de mars et d'octobre à
// 01:00 UTC (29 mars, 25 octobre) ; États-Unis, 2e dimanche de mars à 07:00 UTC (8 mars) et 1er dimanche
// de novembre à 06:00 UTC (1er novembre) pour New York.
import { describe, expect, it } from 'vitest';
import {
  analyze,
  computeQuality,
  groupBySlot,
  InvalidTimeZoneError,
  lastDaysPeriod,
  localDayNumber,
  localHour,
  localMidnight,
  offsetAt,
  renderInsightFr,
  resolveTimeZone,
  slotOf,
  slotOfHour,
  type GlucosePoint,
  type PatientTimeZone,
} from '../src';
import {
  DAY,
  EXPECTED,
  HOUR,
  REFERENCE_NOW,
  REFERENCE_PERIOD,
  TZ_OFFSET_MINUTES,
  referenceDataset,
} from './reference/reference-data';

const utc = (iso: string) => Date.parse(iso);
const MINUTE = 60_000;

describe('décalage du fuseau à un instant donné', () => {
  it('décalage fixe : le même toute l’année (Kinshasa par défaut, UTC+1)', () => {
    expect(offsetAt(utc('2026-01-15T12:00:00Z'))).toBe(60);
    expect(offsetAt(utc('2026-07-15T12:00:00Z'))).toBe(60);
    expect(offsetAt(utc('2026-07-15T12:00:00Z'), -300)).toBe(-300);
    expect(offsetAt(utc('2026-07-15T12:00:00Z'), 345)).toBe(345); // Népal : UTC+5:45
  });

  it('nom IANA sans heure d’été : Africa/Kinshasa = UTC+1 toute l’année', () => {
    expect(offsetAt(utc('2026-01-15T12:00:00Z'), 'Africa/Kinshasa')).toBe(60);
    expect(offsetAt(utc('2026-07-15T12:00:00Z'), 'Africa/Kinshasa')).toBe(60);
  });

  it.each([
    // Paris : passage à l'heure d'été le 29 mars à 01:00 UTC, retour le 25 octobre à 01:00 UTC
    ['Europe/Paris', '2026-03-29T00:59:59Z', 60],
    ['Europe/Paris', '2026-03-29T01:00:00Z', 120],
    ['Europe/Paris', '2026-10-25T00:59:59.999Z', 120],
    ['Europe/Paris', '2026-10-25T01:00:00Z', 60],
    // New York : 8 mars à 07:00 UTC, 1er novembre à 06:00 UTC
    ['America/New_York', '2026-03-08T06:59:59Z', -300],
    ['America/New_York', '2026-03-08T07:00:00Z', -240],
    ['America/New_York', '2026-11-01T05:59:59Z', -240],
    ['America/New_York', '2026-11-01T06:00:00Z', -300],
    // Extrêmes : UTC+5:45, UTC+14 (maximum sur Terre), UTC−12 (minimum)
    ['Asia/Kathmandu', '2026-07-15T12:00:00Z', 345],
    ['Pacific/Kiritimati', '2026-07-15T12:00:00Z', 840],
    ['Etc/GMT+12', '2026-07-15T12:00:00Z', -720],
  ] as const)('%s à %s : %i minutes', (zone, iso, expected) => {
    expect(offsetAt(utc(iso), zone)).toBe(expected);
  });

  it('fonction (fuseau du téléphone) : appelée pour chaque instant', () => {
    const seen: number[] = [];
    const device = (at: number) => {
      seen.push(at);
      return at < utc('2026-10-25T01:00:00Z') ? 120 : 60;
    };
    const offset = resolveTimeZone(device);
    expect(offset(utc('2026-10-24T12:00:00Z'))).toBe(120);
    expect(offset(utc('2026-10-26T12:00:00Z'))).toBe(60);
    expect(seen).toHaveLength(2);
  });
});

describe('fuseau invalide : erreur claire, jamais une analyse silencieusement fausse', () => {
  it.each([
    ['nom inconnu', 'Mars/Olympus'],
    ['nom vide', ''],
    ['décalage au-delà de UTC+14', 841],
    ['décalage en deçà de UTC−12', -721],
    ['décalage non entier', 60.5],
    ['NaN', Number.NaN],
    ['infini', Number.POSITIVE_INFINITY],
  ] as const)('%s', (_, zone) => {
    expect(() => resolveTimeZone(zone)).toThrow(InvalidTimeZoneError);
  });

  it('fonction qui renvoie un décalage impossible : refusée au moment du calcul', () => {
    const offset = resolveTimeZone(() => 1000);
    expect(() => offset(0)).toThrow(InvalidTimeZoneError);
  });

  it('valeur d’un mauvais type (appel depuis du JavaScript) : refusée', () => {
    expect(() => resolveTimeZone(null as unknown as PatientTimeZone)).toThrow(InvalidTimeZoneError);
  });

  it('analyze vérifie le fuseau AVANT tout calcul, même sans assez de mesures', () => {
    const run = () =>
      analyze([], REFERENCE_PERIOD, { now: REFERENCE_NOW, timeZone: 'Europe/Pariss' });
    expect(run).toThrow(InvalidTimeZoneError);
    expect(run).toThrow('Fuseau horaire invalide : Europe/Pariss');
  });
});

describe('créneaux à l’heure locale du patient', () => {
  it('limites des créneaux : 5 h, 11 h, 16 h, 22 h', () => {
    expect([4, 5, 10, 11, 15, 16, 21, 22, 0].map(slotOfHour)).toEqual([
      'NIGHT',
      'MORNING',
      'MORNING',
      'NOON',
      'NOON',
      'EVENING',
      'EVENING',
      'NIGHT',
      'NIGHT',
    ]);
  });

  it('le même instant tombe dans des créneaux différents selon le patient', () => {
    const at = utc('2026-07-15T09:30:00Z');
    expect(slotOf(at)).toBe('MORNING'); // Kinshasa 10:30
    expect(slotOf(at, 'Europe/Paris')).toBe('NOON'); // Paris 11:30 (heure d'été)
    expect(slotOf(at, 'America/New_York')).toBe('MORNING'); // New York 05:30
    expect(slotOf(at, 'Asia/Kathmandu')).toBe('NOON'); // Katmandou 15:15
    expect(slotOf(at, 'Pacific/Kiritimati')).toBe('NIGHT'); // Kiritimati 23:30
  });

  it('heure d’été : 11 h 30 à Paris est « midi » toute l’année (un décalage fixe se trompe l’été)', () => {
    const winter = utc('2026-01-15T10:30:00Z'); // 11:30 à Paris (UTC+1)
    const summer = utc('2026-07-15T09:30:00Z'); // 11:30 à Paris (UTC+2)
    expect(slotOf(winter, 'Europe/Paris')).toBe('NOON');
    expect(slotOf(summer, 'Europe/Paris')).toBe('NOON');
    expect(slotOf(summer, 60)).toBe('MORNING'); // décalage fixe UTC+1 : 10:30, faux
  });

  it('groupBySlot suit le changement d’heure au milieu des mesures', () => {
    // 21:30 locale à Paris, la veille et le lendemain du retour à l'heure d'hiver.
    const points: GlucosePoint[] = [
      { id: 'avant', at: utc('2026-10-24T19:30:00Z'), mgDl: 120 }, // UTC+2 → 21:30
      { id: 'apres', at: utc('2026-10-25T20:30:00Z'), mgDl: 120 }, // UTC+1 → 21:30
    ];
    const slots = groupBySlot(points, 'Europe/Paris');
    expect(slots.EVENING.map((p) => p.id)).toEqual(['avant', 'apres']);
    // Avec UTC+1 fixe, la mesure d'avant serait à 20:30 (soir aussi) ; avec UTC+2 fixe, celle d'après
    // serait à 22:30 (nuit) : seul le vrai fuseau met les deux au même créneau.
    expect(groupBySlot(points, 120).NIGHT.map((p) => p.id)).toEqual(['apres']);
  });
});

describe('jours comptés à la date du calendrier du patient', () => {
  it('heure locale et numéro de jour', () => {
    const at = utc('2026-10-04T22:30:00Z');
    expect(localHour(at, 60)).toBe(23);
    expect(localHour(at, 120)).toBe(0);
    expect(localDayNumber(at, 120) - localDayNumber(at, 60)).toBe(1); // minuit passé à Paris l'été
  });

  // Une période d'une semaine, de minuit à minuit À PARIS, autour du retour à l'heure d'hiver
  // (25 octobre) : elle dure 7 jours + 1 heure.
  const parisWeek = { from: utc('2026-10-18T22:00:00Z'), to: utc('2026-10-25T23:00:00Z') };

  it('semaine qui contient le changement d’heure : toujours 7 jours', () => {
    expect(parisWeek.to - parisWeek.from).toBe(7 * DAY + HOUR);
    expect(computeQuality([], parisWeek, parisWeek.to, 'Europe/Paris').daysInPeriod).toBe(7);
    // Et au printemps (jour de 23 heures) : 22 mars minuit → 29 mars minuit, heure de Paris.
    const spring = { from: utc('2026-03-22T23:00:00Z'), to: utc('2026-03-29T22:00:00Z') };
    expect(computeQuality([], spring, spring.to, 'Europe/Paris').daysInPeriod).toBe(7);
  });

  it('0 h 30 et 23 h 30 le même jour à Paris (été) : UN jour, pas deux', () => {
    const sameDay: GlucosePoint[] = [
      { id: 'a', at: utc('2026-10-19T22:30:00Z'), mgDl: 120 }, // 20 oct, 00:30 à Paris
      { id: 'b', at: utc('2026-10-20T21:30:00Z'), mgDl: 120 }, // 20 oct, 23:30 à Paris
    ];
    expect(computeQuality(sameDay, parisWeek, parisWeek.to, 'Europe/Paris').daysWithData).toBe(1);
    // Avec UTC+1 fixe (l'ancien comportement), la première passerait au 19 : deux jours.
    expect(computeQuality(sameDay, parisWeek, parisWeek.to, 60).daysWithData).toBe(2);
  });

  it('le jour du changement d’heure (25 heures) : 0 h 30 et 23 h 30 = un seul jour', () => {
    const sunday: GlucosePoint[] = [
      { id: 'a', at: utc('2026-10-24T22:30:00Z'), mgDl: 120 }, // 25 oct, 00:30 (UTC+2)
      { id: 'b', at: utc('2026-10-25T22:30:00Z'), mgDl: 120 }, // 25 oct, 23:30 (UTC+1)
    ];
    expect(computeQuality(sunday, parisWeek, parisWeek.to, 'Europe/Paris').daysWithData).toBe(1);
  });

  it('New York (UTC−4 l’été) : 22 h et 2 h le lendemain = deux jours', () => {
    const nyWeek = { from: utc('2026-07-06T04:00:00Z'), to: utc('2026-07-13T04:00:00Z') };
    const points: GlucosePoint[] = [
      { id: 'a', at: utc('2026-07-08T02:00:00Z'), mgDl: 120 }, // 7 juillet, 22:00 à New York
      { id: 'b', at: utc('2026-07-08T06:00:00Z'), mgDl: 120 }, // 8 juillet, 02:00 à New York
    ];
    expect(computeQuality(points, nyWeek, nyWeek.to, 'America/New_York').daysWithData).toBe(2);
    expect(computeQuality(points, nyWeek, nyWeek.to, 60).daysWithData).toBe(1); // faux : 1 jour
  });
});

describe('minuit local et période « les N derniers jours » (L3-03)', () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  const dayOf = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`) / DAY; // numéro du jour local

  it.each([
    // Kinshasa : minuit = 23:00 UTC la veille, toute l'année
    [60, '2026-07-15', '2026-07-14T23:00:00.000Z'],
    // Paris : UTC+2 l'été, UTC+1 l'hiver ; 25 octobre = jour du retour à l'heure d'hiver
    ['Europe/Paris', '2026-10-25', '2026-10-24T22:00:00.000Z'],
    ['Europe/Paris', '2026-10-26', '2026-10-25T23:00:00.000Z'],
    ['Europe/Paris', '2026-03-29', '2026-03-28T23:00:00.000Z'],
    ['Europe/Paris', '2026-03-30', '2026-03-29T22:00:00.000Z'],
    // New York : UTC−4 l'été, UTC−5 l'hiver
    ['America/New_York', '2026-11-01', '2026-11-01T04:00:00.000Z'],
    ['America/New_York', '2026-11-02', '2026-11-02T05:00:00.000Z'],
    ['America/New_York', '2026-03-08', '2026-03-08T05:00:00.000Z'],
    // Kiritimati (UTC+14) : minuit tombe la veille à 10:00 UTC
    ['Pacific/Kiritimati', '2026-07-15', '2026-07-14T10:00:00.000Z'],
    // Heure d'été qui démarre À MINUIT : 0 h n'existe pas, le jour commence à 1 h.
    // La Havane, 2e dimanche de mars (8 mars) : 01:00 heure d'été (UTC−4) = 05:00 UTC.
    ['America/Havana', '2026-03-08', '2026-03-08T05:00:00.000Z'],
    // Santiago, 1er dimanche de septembre (6 septembre) : 01:00 (UTC−3) = 04:00 UTC.
    ['America/Santiago', '2026-09-06', '2026-09-06T04:00:00.000Z'],
    // Santiago, retour à l'heure d'hiver le 5 avril : minuit (UTC−4) = 04:00 UTC.
    ['America/Santiago', '2026-04-05', '2026-04-05T04:00:00.000Z'],
    // Le Caire, dernier vendredi d'avril (24 avril) : 01:00 (UTC+3) = 22:00 UTC la veille.
    ['Africa/Cairo', '2026-04-24', '2026-04-23T22:00:00.000Z'],
  ] as const)('%s, minuit du %s = %s', (zone, date, expected) => {
    expect(iso(localMidnight(dayOf(date), zone))).toBe(expected);
  });

  it('tous les fuseaux connus, chaque jour de changement d’heure de 2026 (et la veille, le lendemain)', () => {
    // Propriété vérifiée : le minuit rendu est DANS le jour demandé, et la minute d'avant est la veille.
    // Les jours de changement sont trouvés semaine par semaine (décalage différent d'un dimanche à
    // l'autre), puis vérifiés un par un. Contrôle complet fait aussi hors test : 152 570 journées, 0 erreur.
    const start = Date.UTC(2026, 0, 1) / DAY;
    const end = Date.UTC(2027, 0, 1) / DAY;
    let checked = 0;
    const wrong: string[] = [];
    for (const zone of Intl.supportedValuesOf('timeZone')) {
      const offset = resolveTimeZone(zone);
      for (let week = start; week < end; week += 7) {
        if (offset(week * DAY) === offset((week + 7) * DAY)) continue; // pas de changement
        for (let day = week - 1; day <= week + 8; day++) {
          const midnight = localMidnight(day, zone);
          const before = midnight - MINUTE;
          checked++;
          if (
            localDayNumber(midnight, offset(midnight)) !== day ||
            localDayNumber(before, offset(before)) !== day - 1
          ) {
            wrong.push(`${zone} ${iso(day * DAY).slice(0, 10)}`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(wrong).toEqual([]);
  });

  it('7 derniers jours à Kinshasa, un dimanche 11 octobre à 9 h 15 : du 5 au 11 inclus', () => {
    const p = lastDaysPeriod(7, Date.parse('2026-10-11T08:15:00Z'));
    expect(iso(p.from)).toBe('2026-10-04T23:00:00.000Z'); // 5 octobre, 00:00 à Kinshasa
    expect(iso(p.to)).toBe('2026-10-11T23:00:00.000Z'); // 12 octobre, 00:00 (exclu)
  });

  it('juste avant et juste après minuit local : la période change de jour', () => {
    const before = lastDaysPeriod(1, Date.parse('2026-10-11T22:59:59.999Z')); // 23:59:59 à Kinshasa
    const after = lastDaysPeriod(1, Date.parse('2026-10-11T23:00:00.000Z')); // 00:00 le 12
    expect(iso(before.from)).toBe('2026-10-10T23:00:00.000Z');
    expect(iso(after.from)).toBe('2026-10-11T23:00:00.000Z');
  });

  it('semaine avec changement d’heure à Paris : 7 jours de calendrier, 7 jours + 1 heure', () => {
    const p = lastDaysPeriod(7, Date.parse('2026-10-25T12:00:00Z'), 'Europe/Paris');
    expect(iso(p.from)).toBe('2026-10-18T22:00:00.000Z'); // 19 octobre, 00:00 (été)
    expect(iso(p.to)).toBe('2026-10-25T23:00:00.000Z'); // 26 octobre, 00:00 (hiver)
    expect(p.to - p.from).toBe(7 * DAY + HOUR);
    expect(computeQuality([], p, p.to, 'Europe/Paris').daysInPeriod).toBe(7);
  });

  it.each([7, 14, 30, 90])('%i jours : exactement %i jours de calendrier', (days) => {
    const p = lastDaysPeriod(days, Date.parse('2026-10-11T08:15:00Z'), 'America/New_York');
    expect(Math.round((p.to - p.from) / DAY)).toBe(days);
  });

  it('nombre de jours invalide : refusé', () => {
    for (const days of [0, -7, 2.5, Number.NaN]) {
      expect(() => lastDaysPeriod(days, 0)).toThrow(RangeError);
    }
  });
});

describe('anomalies calculées dans le créneau LOCAL du patient', () => {
  // New York en juillet (UTC−4). 10 mesures à 04:30 (nuit) et 10 à 05:30 (matin), du 1er au 10 juillet.
  // À Kinshasa, ce serait 09:30 et 10:30 : les deux séries tomberaient dans le même créneau « matin ».
  const nights = [96, 98, 99, 100, 100, 101, 102, 103, 104, 140];
  const mornings = [136, 137, 138, 139, 140, 140, 141, 142, 143, 144];
  const points: GlucosePoint[] = [
    ...nights.map((mgDl, i) => ({
      id: `nuit-${i + 1}`,
      at: Date.UTC(2026, 6, i + 1, 8, 30),
      mgDl,
    })),
    ...mornings.map((mgDl, i) => ({
      id: `matin-${i + 1}`,
      at: Date.UTC(2026, 6, i + 1, 9, 30),
      mgDl,
    })),
  ];
  const period = { from: Date.UTC(2026, 6, 1, 4), to: Date.UTC(2026, 6, 11, 4) };
  const anomalyIds = (timeZone?: PatientTimeZone) =>
    analyze(points, period, { now: period.to, timeZone }).insights.find((i) => i.type === 'ANOMALY')
      ?.evidenceIds ?? [];

  it('à l’heure de New York : 140 la nuit est inhabituel (les nuits sont vers 100)', () => {
    // Nuit : médiane 100,5 ; MAD 2 ⇒ z(140) = 0,6745 × 39,5 / 2 = 13,3. Matin : rien d'inhabituel.
    expect(anomalyIds('America/New_York')).toEqual(['nuit-10']);
  });

  it('avec un mauvais fuseau, les créneaux se mélangent et le résultat est faux', () => {
    expect(anomalyIds()).not.toEqual(['nuit-10']);
  });
});

describe('analyse complète : la semaine de référence vécue ailleurs', () => {
  /**
   * La même semaine (mêmes heures sur l'horloge du patient) chez un patient dont le fuseau vaut
   * `offset` : chaque instant UTC est décalé de (UTC+1 − offset). Fin septembre, Paris est à UTC+2 et
   * New York à UTC−4 (heure d'été).
   */
  const livedAt = (offset: number) => {
    const shift = (TZ_OFFSET_MINUTES - offset) * MINUTE;
    return {
      points: referenceDataset().map((p) => ({ ...p, at: p.at + shift })),
      period: { from: REFERENCE_PERIOD.from + shift, to: REFERENCE_PERIOD.to + shift },
      now: REFERENCE_NOW + shift,
    };
  };

  it.each([
    ['America/New_York', -240],
    ['Europe/Paris', 120],
    ['Asia/Kathmandu', 345],
  ] as const)('%s : exactement les résultats de référence', (zone, offset) => {
    const { points, period, now } = livedAt(offset);
    const r = analyze(points, period, { now, timeZone: zone });
    expect(r.stats).toMatchObject(EXPECTED.stats);
    expect(r.quality).toEqual(EXPECTED.quality);
    expect(r.insights).toEqual(EXPECTED.insights);
    expect(r.insights.map(renderInsightFr)).toEqual(EXPECTED.sentences);
  });

  it('même résultat avec la fonction du téléphone ou le décalage fixe correspondant', () => {
    const { points, period, now } = livedAt(-240);
    const byName = analyze(points, period, { now, timeZone: 'America/New_York' });
    expect(analyze(points, period, { now, timeZone: () => -240 })).toEqual(byName);
    expect(analyze(points, period, { now, timeZone: -240 })).toEqual(byName);
  });

  it('sans le fuseau du patient (UTC+1 par défaut), New York serait mal analysé', () => {
    const { points, period, now } = livedAt(-240);
    const wrong = analyze(points, period, { now });
    // 07 h à New York = 12 h à Kinshasa : les créneaux glissent, la tendance « soir » disparaît…
    expect(wrong.insights.map((i) => i.type)).not.toContain('TIME_OF_DAY_PATTERN');
    // …et les jours aussi : les mesures de 23 h passent au lendemain.
    expect(wrong.quality.daysWithData).not.toBe(EXPECTED.quality.daysWithData);
  });
});
