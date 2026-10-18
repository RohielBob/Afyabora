// Tests du ticket L5-09 : journal d'accès regroupé en visites (log.ts), fonctions pures.
import { accessLogEntrySchema, type AccessLogEntry } from '@glyka/shared';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { buildVisits, formatMinutes, visitMinutes, type ShareVisit } from '../log';

let n = 0;
const S1 = '3f2a1c9e-1111-4111-8111-111111111111';
const S2 = '3f2a1c9e-2222-4222-8222-222222222222';
const S3 = '3f2a1c9e-3333-4333-8333-333333333333';
const entry = (
  action: AccessLogEntry['action'],
  at: string,
  sessionId: string | null,
  actorName: string | null = 'Aline Démo',
): AccessLogEntry => {
  n += 1;
  return accessLogEntrySchema.parse({
    id: `3f2a1c9e-9999-4999-8999-${String(n).padStart(12, '0')}`,
    action,
    at,
    sessionId,
    actorName,
  });
};

describe('buildVisits', () => {
  it('une visite = scan + fin : qui, quand, comment ça s’est terminé', () => {
    const visits = buildVisits([
      entry('SHARE_EXPIRED', '2026-10-18T09:30:00.000Z', S1),
      entry('SHARE_CLAIMED', '2026-10-18T09:00:00.000Z', S1),
    ]);
    expect(visits).toEqual([
      {
        kind: 'share',
        key: S1,
        doctorName: 'Aline Démo',
        startedAt: '2026-10-18T09:00:00.000Z',
        endedAt: '2026-10-18T09:30:00.000Z',
        end: 'expired',
        views: 0,
        reportDownloads: 0,
      },
    ]);
  });

  it('arrêtée par le patient ⇒ « revoked » ; sans fin connue ⇒ en cours', () => {
    const visits = buildVisits([
      entry('SHARE_CLAIMED', '2026-10-18T08:00:00.000Z', S1),
      entry('SHARE_REVOKED', '2026-10-18T08:05:00.000Z', S1),
      entry('SHARE_CLAIMED', '2026-10-18T10:00:00.000Z', S2, 'Bruno Exemple'),
    ]);
    expect(visits.map((v) => [(v as ShareVisit).doctorName, (v as ShareVisit).end])).toEqual([
      ['Bruno Exemple', null],
      ['Aline Démo', 'revoked'],
    ]);
  });

  it('QR arrêté avant tout scan : pas de visite (aucun accès n’a eu lieu)', () => {
    expect(buildVisits([entry('SHARE_REVOKED', '2026-10-18T08:00:00.000Z', S1, null)])).toEqual([]);
  });

  it('consultations et rapports de la session sont comptés', () => {
    const [visit] = buildVisits([
      entry('SHARE_CLAIMED', '2026-10-18T08:00:00.000Z', S1),
      entry('SHARE_VIEWED', '2026-10-18T08:01:00.000Z', S1),
      entry('SHARE_VIEWED', '2026-10-18T08:02:00.000Z', S1),
      entry('REPORT_DOWNLOADED', '2026-10-18T08:03:00.000Z', S1),
      entry('SHARE_VIEWED', '2026-10-18T09:00:00.000Z', S2), // autre session, sans scan connu
    ]);
    expect(visit).toMatchObject({ views: 2, reportDownloads: 1 });
  });

  it('la PREMIÈRE fin compte (expiration puis arrêt tardif : expirée)', () => {
    const [visit] = buildVisits([
      entry('SHARE_CLAIMED', '2026-10-18T08:00:00.000Z', S1),
      entry('SHARE_REVOKED', '2026-10-18T08:40:00.000Z', S1),
      entry('SHARE_EXPIRED', '2026-10-18T08:30:00.000Z', S1),
    ]);
    expect(visit).toMatchObject({ end: 'expired', endedAt: '2026-10-18T08:30:00.000Z' });
  });

  it('accès d’urgence : une visite à part, sans nom', () => {
    const visits = buildVisits([
      entry('EMERGENCY_VIEWED', '2026-10-18T07:00:00.000Z', null, null),
      entry('SHARE_CLAIMED', '2026-10-18T08:00:00.000Z', S1),
    ]);
    expect(visits.map((v) => v.kind)).toEqual(['share', 'emergency']);
    expect(visits[1]).toMatchObject({ kind: 'emergency', at: '2026-10-18T07:00:00.000Z' });
  });

  it('la plus récente d’abord, quel que soit l’ordre reçu', () => {
    const visits = buildVisits([
      entry('SHARE_CLAIMED', '2026-10-16T08:00:00.000Z', S1),
      entry('SHARE_CLAIMED', '2026-10-18T08:00:00.000Z', S3),
      entry('SHARE_CLAIMED', '2026-10-17T08:00:00.000Z', S2),
    ]);
    expect(visits.map((v) => v.key)).toEqual([S3, S2, S1]);
  });

  it('visite coupée entre deux pages : recomposée ; ligne reçue deux fois : comptée une fois', () => {
    const claim = entry('SHARE_CLAIMED', '2026-10-18T08:00:00.000Z', S1);
    const view = entry('SHARE_VIEWED', '2026-10-18T08:01:00.000Z', S1);
    const end = entry('SHARE_EXPIRED', '2026-10-18T08:30:00.000Z', S1);
    const page1 = [end, view];
    const page2 = [view, claim]; // la consultation revient (page rechargée)
    const visits = buildVisits([...page1, ...page2]);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ end: 'expired', views: 1 });
  });

  it('compte médecin supprimé : pas de nom (l’écran affiche « Médecin »)', () => {
    const [visit] = buildVisits([entry('SHARE_CLAIMED', '2026-10-18T08:00:00.000Z', S1, null)]);
    expect((visit as ShareVisit).doctorName).toBeNull();
  });

  it('le nom manque sur le scan mais figure sur une autre ligne de la session : repris', () => {
    const [visit] = buildVisits([
      entry('SHARE_CLAIMED', '2026-10-18T08:00:00.000Z', S1, null),
      entry('SHARE_REVOKED', '2026-10-18T08:10:00.000Z', S1, 'Aline Démo'),
    ]);
    expect((visit as ShareVisit).doctorName).toBe('Aline Démo');
  });

  it('ligne sans session (autre qu’urgence) : ignorée', () => {
    expect(buildVisits([entry('SHARE_VIEWED', '2026-10-18T08:00:00.000Z', null)])).toEqual([]);
  });
});

describe('durée réelle', () => {
  const visit = (start: string, end: string | null) =>
    ({ startedAt: start, endedAt: end }) as ShareVisit;

  it.each([
    ['2026-10-18T08:00:00.000Z', '2026-10-18T08:12:00.000Z', 12],
    ['2026-10-18T08:00:00.000Z', '2026-10-18T08:00:20.000Z', 1], // au moins 1 min
    ['2026-10-18T08:00:00.000Z', '2026-10-18T08:12:40.000Z', 13], // arrondie
    ['2026-10-18T08:00:00.000Z', '2026-10-18T10:00:00.000Z', 120],
  ])('%s → %s : %i min', (start, end, minutes) => {
    expect(visitMinutes(visit(start, end))).toBe(minutes);
  });

  it('accès en cours : pas de durée', () => {
    expect(visitMinutes(visit('2026-10-18T08:00:00.000Z', null))).toBeNull();
  });

  it.each([
    [12, '12 min'],
    [59, '59 min'],
    [60, '1 h'],
    [65, '1 h 05'],
    [120, '2 h'],
  ])('%i ⇒ « %s »', (minutes, text) => {
    expect(formatMinutes(minutes)).toBe(text);
  });
});

describe('textes (fr et en)', () => {
  it('« Dr Prénom Nom » et « Médecin » (décision d’équipe), mêmes clés en fr et en', () => {
    expect(fr.share.log.doctor).toBe('Dr {{name}}');
    expect(fr.share.log.unknownDoctor).toBe('Médecin');
    const keys = (node: unknown, prefix = ''): string[] =>
      typeof node === 'object' && node !== null
        ? Object.entries(node).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
        : [prefix];
    expect(keys(en.share.log).sort()).toEqual(keys(fr.share.log).sort());
  });
});
