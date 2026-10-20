// Ticket L1-05 (mobile) : Réglages → Unités et seuils. Logique seule (aucun écran, aucun réseau).
import { DEFAULT_THRESHOLDS } from '@glyka/shared';
import { ApiError } from '@/lib/api-client';
import type { PatientProfileResponse } from '../api';
import {
  checkUnitsDraft,
  draftFromProfile,
  draftMgDl,
  hasChanges,
  unitsProblem,
} from '../settings';

/** Profil complet tel que le renvoie GET /me/profile (fictif). */
const PROFILE: PatientProfileResponse = {
  firstName: 'Amani',
  lastName: 'Kabeya',
  birthDate: '1988-05-12',
  sex: 'F',
  diabetesType: 'TYPE_2',
  diagnosisYear: 2016,
  preferredUnit: 'G_L',
  thresholds: { veryLowMgDl: 54, targetMinMgDl: 70, targetMaxMgDl: 180, veryHighMgDl: 250 },
  thresholdsReviewedByClinician: false,
  emergencyContact: { name: 'Joseph', phone: '+243810000000', relation: 'Frère' },
  doctorContact: { name: 'Dr Mbala', phone: '+243820000000' },
  country: 'CD',
  emergencyNumber: '112',
  updatedAt: '2026-10-19T08:00:00.000Z',
};

describe('draftFromProfile', () => {
  it('affiche les seuils dans l’unité du profil, à la française', () => {
    expect(draftFromProfile(PROFILE)).toEqual({
      unit: 'G_L',
      thresholds: {
        veryLowMgDl: '0,54',
        targetMinMgDl: '0,70',
        targetMaxMgDl: '1,80',
        veryHighMgDl: '2,50',
      },
      reviewed: false,
    });
    expect(draftFromProfile({ ...PROFILE, preferredUnit: 'MG_DL' }).thresholds.targetMaxMgDl).toBe(
      '180',
    );
  });
});

describe('checkUnitsDraft', () => {
  it('renvoie TOUT le profil (contacts, pays…), sans updatedAt, avec la nouvelle unité et les seuils en mg/dL', () => {
    const draft = {
      ...draftFromProfile(PROFILE),
      unit: 'MMOL_L' as const,
      thresholds: {
        veryLowMgDl: '3,0',
        targetMinMgDl: '4,0',
        targetMaxMgDl: '9,0',
        veryHighMgDl: '13,0',
      },
      reviewed: true,
    };
    const check = checkUnitsDraft(PROFILE, draft);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    const { updatedAt: _ignored, ...unchanged } = PROFILE;
    expect(check.payload).toEqual({
      ...unchanged,
      preferredUnit: 'MMOL_L',
      thresholds: { veryLowMgDl: 54, targetMinMgDl: 72, targetMaxMgDl: 162, veryHighMgDl: 234 },
      thresholdsReviewedByClinician: true,
    });
    expect(check.payload).not.toHaveProperty('updatedAt');
  });

  it('ordre des seuils non respecté : erreur sur le champ, message de l’assistant', () => {
    const draft = draftFromProfile(PROFILE);
    draft.thresholds.targetMinMgDl = '2,00'; // plage cible au-dessus du haut de la plage
    const check = checkUnitsDraft(PROFILE, draft);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(Object.keys(check.errors).every((path) => path.startsWith('thresholds.'))).toBe(true);
    expect(Object.values(check.errors)[0]).toMatch(/^onboarding\.errors\.thresholds\./);
  });

  it('valeur illisible : erreur sur ce seuil', () => {
    const draft = draftFromProfile(PROFILE);
    draft.thresholds.veryHighMgDl = 'abc';
    const check = checkUnitsDraft(PROFILE, draft);
    expect(check).toMatchObject({
      ok: false,
      errors: { 'thresholds.veryHighMgDl': 'onboarding.errors.thresholds.veryHighMgDl' },
    });
  });

  it('profil du serveur abîmé (autre champ invalide) : envoi bloqué, erreur « profile »', () => {
    const broken = { ...PROFILE, firstName: '' };
    const check = checkUnitsDraft(broken, draftFromProfile(broken));
    expect(check).toEqual({
      ok: false,
      errors: { profile: 'settings.unitsScreen.problem.profile' },
    });
  });
});

describe('hasChanges', () => {
  it('rien changé ⇒ faux ; changer d’unité sans changer les valeurs ⇒ vrai', () => {
    expect(hasChanges(PROFILE, draftFromProfile(PROFILE))).toBe(false);
    // Mêmes seuils, simplement affichés en mg/dL : SEULE l'unité change.
    const sameInMgDl = draftFromProfile({ ...PROFILE, preferredUnit: 'MG_DL' });
    expect(draftMgDl(sameInMgDl)).toEqual(PROFILE.thresholds);
    expect(hasChanges(PROFILE, sameInMgDl)).toBe(true);
  });

  it('un seuil ou la case « définis avec mon médecin » ⇒ vrai', () => {
    const draft = draftFromProfile(PROFILE);
    expect(hasChanges(PROFILE, { ...draft, reviewed: true })).toBe(true);
    draft.thresholds.veryHighMgDl = '2,60';
    expect(hasChanges(PROFILE, draft)).toBe(true);
  });

  it('même valeur écrite autrement (« 0.7 » au lieu de « 0,70 ») ⇒ pas de changement', () => {
    const draft = draftFromProfile(PROFILE);
    draft.thresholds.targetMinMgDl = '0.7';
    expect(hasChanges(PROFILE, draft)).toBe(false);
  });
});

describe('draftMgDl et unitsProblem', () => {
  it('draftMgDl : mg/dL entiers, null pour une valeur illisible', () => {
    const draft = draftFromProfile({ ...PROFILE, thresholds: DEFAULT_THRESHOLDS });
    expect(draftMgDl(draft)).toEqual(DEFAULT_THRESHOLDS);
    draft.thresholds.veryLowMgDl = '';
    expect(draftMgDl(draft).veryLowMgDl).toBeNull();
  });

  it('unitsProblem : hors-ligne, profil absent, refus du serveur, autre', () => {
    expect(unitsProblem(new ApiError(0, 'injoignable'))).toBe('offline');
    expect(unitsProblem(new ApiError(404, 'absent'))).toBe('noProfile');
    expect(unitsProblem(new ApiError(400, 'refusé'))).toBe('invalid');
    expect(unitsProblem(new ApiError(500, 'panne'))).toBe('error');
    expect(unitsProblem(new Error('x'))).toBe('error');
  });
});
