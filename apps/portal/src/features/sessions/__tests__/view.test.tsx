// Tests du ticket L5-11 : « Mes patients partagés » (règles d'affichage et carte), sans navigateur.
import type { DoctorSessionDto } from '@glyka/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { fr } from '@/i18n/fr';
import { SessionCard } from '../SessionCard';
import { lastMeasurementText, orderedCategories, qualityView, statusView, when } from '../view';

const NOW = new Date(2026, 9, 18, 17, 0); // 18 oct. 2026, 17:00 (heure locale)
const local = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString();
const session = (over: Partial<DoctorSessionDto> = {}): DoctorSessionDto => ({
  sessionId: '3f2a1c9e-1111-4111-8111-111111111111',
  status: 'ACTIVE',
  claimedAt: local(18, 16, 42),
  expiresAt: local(18, 17, 12),
  categories: ['MEALS', 'GLUCOSE_HISTORY'],
  patient: { firstName: 'Awa', diabetesType: 'TYPE_1' },
  lastMeasurementAt: local(18, 8, 12),
  quality: { score: 82, level: 'GOOD' },
  ...over,
});

describe('statusView', () => {
  it('accès en cours : « jusqu’à 17:12 » (heure de fin donnée par le serveur)', () => {
    expect(statusView(session(), NOW)).toEqual({
      tone: 'active',
      label: 'Accès en cours',
      when: 'jusqu’à 17:12',
    });
  });

  it('expiré un autre jour : « terminé à 17 oct. à 18:00 »', () => {
    const view = statusView(session({ status: 'EXPIRED', expiresAt: local(17, 18) }), NOW);
    expect(view.tone).toBe('ended');
    expect(view.label).toBe('Accès expiré');
    expect(view.when).toMatch(/^terminé à 17 oct\.? à 18:00$/);
  });

  it('arrêté par le patient : pas d’heure de fin (il y a mis fin avant)', () => {
    expect(statusView(session({ status: 'REVOKED' }), NOW)).toEqual({
      tone: 'ended',
      label: 'Arrêté par le patient',
      when: null,
    });
  });
});

describe('when', () => {
  it('aujourd’hui : l’heure seule ; un autre jour : la date aussi', () => {
    expect(when(local(18, 9, 5), NOW)).toBe('09:05');
    expect(when(local(16, 9, 5), NOW)).toMatch(/^16 oct\.? à 09:05$/);
  });
});

describe('lastMeasurementText', () => {
  it('aujourd’hui / un autre jour', () => {
    expect(lastMeasurementText(session(), NOW)).toBe('Dernière mesure aujourd’hui à 08:12');
    expect(lastMeasurementText(session({ lastMeasurementAt: local(15, 7, 30) }), NOW)).toMatch(
      /^Dernière mesure le 15 oct\.? à 07:30$/,
    );
  });

  it('historique partagé mais aucune mesure : on le dit', () => {
    expect(lastMeasurementText(session({ lastMeasurementAt: null }), NOW)).toBe(
      'Aucune mesure enregistrée',
    );
  });

  it('historique non partagé, ou accès terminé : rien (pas même « aucune mesure »)', () => {
    expect(lastMeasurementText(session({ categories: ['MEALS'] }), NOW)).toBeNull();
    expect(lastMeasurementText(session({ status: 'EXPIRED' }), NOW)).toBeNull();
  });
});

describe('qualityView et catégories', () => {
  it('libellé de chaque niveau et texte lu au lecteur d’écran', () => {
    expect(qualityView('GOOD', 82)).toEqual({
      label: 'Données de bonne qualité',
      a11y: 'Qualité des données : Données de bonne qualité, 82 sur 100',
    });
    expect(qualityView('PARTIAL', 50).label).toBe('Données partielles');
    expect(qualityView('INSUFFICIENT', 10).label).toBe('Données insuffisantes');
  });

  it('catégories dans l’ordre du contrat, quel que soit l’ordre reçu', () => {
    expect(orderedCategories(['REPORT_DOWNLOAD', 'MEALS', 'GLUCOSE_HISTORY'])).toEqual([
      'GLUCOSE_HISTORY',
      'MEALS',
      'REPORT_DOWNLOAD',
    ]);
  });
});

describe('SessionCard', () => {
  const render = (s: DoctorSessionDto) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <ul>
          <SessionCard session={s} now={NOW} index={0} />
        </ul>
      </MemoryRouter>,
    );

  it('accès en cours : prénom, type, état (icône + texte), partage, dernière mesure, qualité, bouton', () => {
    const html = render(session());
    expect(html).toContain('>Awa<');
    expect(html).toContain('Diabète de type 1');
    expect(html).toContain('Accès en cours');
    expect(html).toContain('jusqu’à 17:12');
    expect(html).toContain('Glycémies · Repas');
    expect(html).toContain('Dernière mesure aujourd’hui à 08:12');
    expect(html).toContain(
      'aria-label="Qualité des données : Données de bonne qualité, 82 sur 100"',
    );
    expect(html).toContain('href="/patients/3f2a1c9e-1111-4111-8111-111111111111"');
    expect(html).toContain(fr.patients.open);
    // L'état a SON icône (forme + texte), jamais la couleur seule.
    expect(html).toMatch(/<svg aria-hidden="true"[^>]*>(?:(?!<\/span>).)*<\/svg>Accès en cours/);
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i); // couleurs du thème uniquement
  });

  it('accès terminé : grisé, sans bouton ni donnée', () => {
    const html = render(session({ status: 'REVOKED', lastMeasurementAt: null, quality: null }));
    expect(html).toMatch(
      /<svg aria-hidden="true"[^>]*>(?:(?!<\/span>).)*<\/svg>Arrêté par le patient/,
    );
    expect(html).toContain('opacity-75');
    expect(html).not.toContain('href=');
    expect(html).not.toContain('Dernière mesure');
    expect(html).not.toContain('Qualité des données');
  });
});
