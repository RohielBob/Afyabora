// Tests du ticket L5-12 : dossier patient (règles d'affichage, lecture des pages, onglets rendus), sans
// navigateur.
import type { DoctorSummary, InsightDto, TimelineItem } from '@glyka/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { GlucoseStateBadge } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { collect, MAX_PAGES } from '../api';
import { OverviewTab } from '../tabs/OverviewTab';
import { SummaryTab } from '../tabs/SummaryTab';
import { TimelineTab } from '../tabs/TimelineTab';
import {
  dayLabel,
  groupByDay,
  insightView,
  itemText,
  periodStart,
  pickTab,
  recordProblem,
  stateView,
  tabsFor,
  valueText,
} from '../view';

const NOW = new Date(2026, 9, 18, 17, 0); // 18 oct. 2026, 17:00 (heure locale)
const local = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString();

const summary = (over: Partial<DoctorSummary> = {}): DoctorSummary => ({
  session: {
    id: '3f2a1c9e-1111-4111-8111-111111111111',
    status: 'ACTIVE',
    expiresAt: local(18, 17, 30),
    categories: ['GLUCOSE_HISTORY', 'MEALS'],
  },
  patient: {
    firstName: 'Awa',
    diabetesType: 'TYPE_1',
    diagnosisYear: 2015,
    preferredUnit: 'G_L',
    thresholds: { veryLowMgDl: 60, targetMinMgDl: 80, targetMaxMgDl: 160, veryHighMgDl: 240 },
  },
  quality: {
    score: 82,
    level: 'GOOD',
    coverage: 90,
    density: 70,
    freshness: 100,
    analyzable: true,
    daysInPeriod: 30,
    daysWithData: 27,
  },
  stats: {
    count: 84,
    meanMgDl: 132.4,
    sdMgDl: 31.2,
    cvPercent: 23.6,
    timeInRangePct: 71.4,
    timeAbovePct: 22.6,
    timeBelowPct: 6,
  },
  ...over,
});

const item = (over: Partial<TimelineItem>): TimelineItem => ({
  kind: 'MEASUREMENT',
  at: local(18, 8, 12),
  label: 'FASTING',
  valueMgDl: 148,
  state: 'IN_RANGE',
  source: 'MANUAL',
  ...over,
});

describe('onglets', () => {
  it('un onglet dont la catégorie n’est pas partagée n’existe pas ; la vue d’ensemble toujours', () => {
    expect(tabsFor([])).toEqual(['overview']);
    expect(tabsFor(['MEALS'])).toEqual(['overview', 'timeline', 'meals']);
    expect(tabsFor(['GLUCOSE_HISTORY'])).toEqual(['overview', 'glucose', 'timeline']);
    expect(tabsFor(['AI_SUMMARY', 'PERSONAL_NOTES', 'REPORT_DOWNLOAD'])).toEqual([
      'overview',
      'summary',
    ]);
    expect(tabsFor(['GLUCOSE_HISTORY', 'TREATMENTS', 'MEALS', 'ACTIVITY', 'AI_SUMMARY'])).toEqual([
      'overview',
      'glucose',
      'timeline',
      'treatments',
      'meals',
      'activity',
      'summary',
    ]);
  });

  it('onglet de l’adresse gardé s’il existe pour ce partage, sinon la vue d’ensemble', () => {
    expect(pickTab('glucose', ['overview', 'glucose'])).toBe('glucose');
    expect(pickTab('glucose', ['overview', 'timeline'])).toBe('overview');
    expect(pickTab(null, ['overview'])).toBe('overview');
  });
});

describe('valeurs, états et dates', () => {
  it('unité choisie, virgule française', () => {
    expect(valueText(148, 'G_L')).toBe('1,48 g/L');
    expect(valueText(148, 'MG_DL')).toBe('148 mg/dL');
    expect(valueText(148, 'MMOL_L')).toBe('8,2 mmol/L');
    expect(valueText(148, 'G_L', false)).toBe('1,48');
  });

  it('état : symbole + libellé, et le nom de ses couleurs', () => {
    expect(stateView('VERY_HIGH')).toEqual({ symbol: '▲▲', label: 'Très haut', slug: 'very-high' });
    expect(stateView('LOW')).toEqual({ symbol: '▼', label: 'En dessous', slug: 'low' });
  });

  it('jour : aujourd’hui, hier, sinon le jour en toutes lettres', () => {
    expect(dayLabel(local(18, 8), NOW)).toBe('Aujourd’hui');
    expect(dayLabel(local(17, 23, 59), NOW)).toBe('Hier');
    expect(dayLabel(local(15, 8), NOW)).toBe('jeudi 15 octobre');
  });

  it('période : les N derniers jours jusqu’à maintenant', () => {
    expect(periodStart(7, NOW)).toBe(new Date(NOW.getTime() - 7 * 86_400_000).toISOString());
  });
});

describe('chronologie', () => {
  it('mesure : valeur dans l’unité + moment traduit ; évènement : le libellé du patient', () => {
    expect(itemText(item({}), 'G_L')).toBe('1,48 g/L · À jeun');
    expect(itemText(item({ label: 'INCONNU' }), 'MG_DL')).toBe('148 mg/dL');
    expect(
      itemText(
        item({ kind: 'MEAL', label: 'Riz et haricots', valueMgDl: null, state: null }),
        'G_L',
      ),
    ).toBe('Riz et haricots');
  });

  it('regroupée par jour, dans l’ordre reçu', () => {
    const days = groupByDay(
      [item({ at: local(18, 9) }), item({ at: local(18, 7) }), item({ at: local(16, 20) })],
      NOW,
    );
    expect(days.map((d) => [d.label, d.items.length])).toEqual([
      ['Aujourd’hui', 2],
      ['vendredi 16 octobre', 1],
    ]);
  });

  it('onglet « Traitements » : seulement les traitements, avec l’avertissement « aucune dose »', () => {
    const html = renderToStaticMarkup(
      <TimelineTab
        items={[
          item({}),
          item({
            kind: 'TREATMENT',
            label: 'Metformine',
            valueMgDl: null,
            state: null,
            source: null,
          }),
          item({ kind: 'MEAL', label: 'Riz', valueMgDl: null, state: null, source: null }),
        ]}
        truncated={false}
        unit="G_L"
        kind="TREATMENT"
        now={NOW}
      />,
    );
    expect(html).toContain('Metformine');
    expect(html).not.toContain('Riz');
    expect(html).not.toContain('1,48');
    expect(html).toContain('ne calcule ni ne conseille aucune dose');
  });

  it('chronologie complète : état en symbole + mot et provenance sur une mesure', () => {
    const html = renderToStaticMarkup(
      <TimelineTab
        items={[item({ state: 'HIGH', valueMgDl: 190 })]}
        truncated={false}
        unit="G_L"
        now={NOW}
      />,
    );
    expect(html).toContain('▲');
    expect(html).toContain('Au-dessus');
    expect(html).toContain('Saisie');
    expect(html).toContain('aria-label="08:12, Glycémie : 1,90 g/L · À jeun, Au-dessus"');
  });

  it('vide : un message selon l’onglet', () => {
    const html = renderToStaticMarkup(
      <TimelineTab items={[]} truncated={false} unit="G_L" kind="MEAL" now={NOW} />,
    );
    expect(html).toContain('Aucun repas noté sur cette période.');
  });
});

describe('vue d’ensemble', () => {
  it('qualité, chiffres dans l’unité, répartition et seuils du patient', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OverviewTab summary={summary()} unit="G_L" />
      </MemoryRouter>,
    );
    expect(html).toContain('82');
    expect(html).toContain('Données de bonne qualité');
    expect(html).toContain('27 jours avec au moins une mesure sur 30');
    expect(html).toContain('1,32 g/L'); // moyenne
    expect(html).toContain('>71 %<'); // pourcentages entiers, comme l’application du patient
    expect(html).toContain('Répartition : 71 % dans la plage, 23 % au-dessus, 6 % en dessous');
    expect(html).toContain('0,80 à 1,60 g/L'); // plage cible DU patient
    expect(html).toContain('Très bas sous');
    expect(html).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it('sans chiffres : « moins de 10 mesures » ou « non partagé » selon ce qui est partagé', () => {
    const notEnough = renderToStaticMarkup(
      <OverviewTab summary={summary({ stats: null })} unit="G_L" />,
    );
    expect(notEnough).toContain('Moins de 10 mesures');
    const notShared = renderToStaticMarkup(
      <OverviewTab
        summary={summary({
          stats: null,
          session: { ...summary().session, categories: ['MEALS'] },
        })}
        unit="G_L"
      />,
    );
    expect(notShared).toContain('aucun chiffre n’est affiché');
    // La qualité calculée sur zéro mesure n'est pas montrée comme « 0/100 » (le patient mesure peut-être).
    expect(notShared).not.toContain('/100');
    expect(notShared).not.toContain('Données insuffisantes');
  });
});

describe('résumé des analyses', () => {
  const insight: InsightDto = {
    type: 'REPEATED_HYPO',
    severity: 'ATTENTION',
    facts: { count: 4 },
    evidenceIds: ['a', 'b', 'c', 'd'],
    text: 'Des valeurs basses reviennent plusieurs fois le soir.',
  };

  it('gravité et type en mots, nombre de mesures justificatives', () => {
    expect(insightView(insight)).toEqual({
      severity: 'À surveiller',
      type: 'Valeurs basses répétées',
      evidence: 'Basée sur 4 mesures',
    });
    expect(insightView({ ...insight, evidenceIds: ['a'] }).evidence).toBe('Basée sur 1 mesure');
    expect(insightView({ ...insight, evidenceIds: [] }).evidence).toBeNull();
  });

  it('carte : phrase, gravité, rappel « pas un diagnostic » ; pas de rouge', () => {
    const html = renderToStaticMarkup(<SummaryTab insights={[insight]} />);
    expect(html).toContain('Des valeurs basses reviennent');
    expect(html).toContain('À surveiller');
    expect(html).toContain('ni des diagnostics ni des conseils de traitement');
    expect(html).not.toContain('danger');
    expect(renderToStaticMarkup(<SummaryTab insights={[]} />)).toContain('Aucune observation');
  });
});

describe('badge d’état glycémique', () => {
  it('symbole + libellé, couleurs de la palette des états (jamais en dur)', () => {
    const html = renderToStaticMarkup(<GlucoseStateBadge state="VERY_LOW" />);
    expect(html).toContain('▼▼');
    expect(html).toContain('Très bas');
    expect(html).toContain('bg-state-very-low-bg');
    expect(html).not.toMatch(/#[0-9a-f]{3,6}/i);
    const compact = renderToStaticMarkup(<GlucoseStateBadge state="HIGH" compact />);
    expect(compact).toContain('sr-only">Au-dessus<');
  });
});

describe('erreurs', () => {
  const err = (status: number, code?: string) => new ApiError(status, 'x', code ? { code } : {});

  it('accès échu, arrêté, compte plus approuvé, pas son dossier : l’accès est terminé', () => {
    expect(recordProblem(err(403, 'SESSION_EXPIRED'))).toEqual({
      kind: 'ended',
      reason: 'EXPIRED',
    });
    expect(recordProblem(err(403, 'SESSION_REVOKED'))).toEqual({
      kind: 'ended',
      reason: 'REVOKED',
    });
    expect(recordProblem(err(403, 'DOCTOR_NOT_APPROVED'))).toEqual({
      kind: 'ended',
      reason: 'APPROVAL',
    });
    expect(recordProblem(err(403))).toEqual({ kind: 'ended', reason: 'OTHER' });
    expect(recordProblem(err(404))).toEqual({ kind: 'ended', reason: 'OTHER' });
  });

  it('réseau, serveur, catégorie refusée, erreur inattendue : un problème, pas une fin', () => {
    expect(recordProblem(err(0))).toEqual({ kind: 'network' });
    expect(recordProblem(err(500))).toEqual({ kind: 'server' });
    expect(recordProblem(err(403, 'CATEGORY_NOT_SHARED'))).toEqual({ kind: 'server' });
    expect(recordProblem(new Error('schéma'))).toEqual({ kind: 'server' });
  });
});

describe('lecture page après page', () => {
  it('suit le curseur jusqu’à la fin', async () => {
    const seen: (string | null)[] = [];
    const result = await collect(async (cursor) => {
      seen.push(cursor);
      return cursor === null
        ? { items: [1, 2], nextCursor: 'c1' }
        : { items: [3], nextCursor: null };
    });
    expect(result).toEqual({ items: [1, 2, 3], truncated: false });
    expect(seen).toEqual([null, 'c1']);
  });

  it(`s’arrête après ${MAX_PAGES} pages et le signale`, async () => {
    let calls = 0;
    const result = await collect(async () => {
      calls++;
      return { items: [calls], nextCursor: 'encore' };
    });
    expect(calls).toBe(MAX_PAGES);
    expect(result.truncated).toBe(true);
  });
});
