// Ticket L1-05 : validation du profil patient et des seuils d'alerte (patientProfileSchema).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { patientProfileSchema, thresholdsSchema } from '../src';

const valid = {
  firstName: 'Jean',
  lastName: 'Demo',
  birthDate: '1980-05-14',
  sex: 'M',
  diabetesType: 'TYPE_2',
  diagnosisYear: 2016,
  thresholds: { veryLowMgDl: 54, targetMinMgDl: 70, targetMaxMgDl: 180, veryHighMgDl: 250 },
};

/** Chemins des erreurs, pour vérifier que chaque message pointe le bon champ. */
const errorPaths = (input: unknown) => {
  const result = patientProfileSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
};

afterEach(() => {
  vi.useRealTimers();
});

describe('patientProfileSchema', () => {
  it('accepte un profil complet et applique les valeurs par défaut', () => {
    const parsed = patientProfileSchema.parse(valid);
    expect(parsed.preferredUnit).toBe('G_L');
    expect(parsed.thresholdsReviewedByClinician).toBe(false);
  });

  it('accepte un profil sans champ facultatif (année du diagnostic, contact d’urgence)', () => {
    const { diagnosisYear: _omis, ...minimal } = valid;
    expect(patientProfileSchema.safeParse(minimal).success).toBe(true);
  });

  it('refuse des seuils dans le mauvais ordre, en désignant le champ fautif', () => {
    const t = valid.thresholds;
    expect(errorPaths({ ...valid, thresholds: { ...t, veryLowMgDl: 80 } })).toEqual([
      'thresholds.veryLowMgDl',
    ]);
    expect(errorPaths({ ...valid, thresholds: { ...t, targetMaxMgDl: 60 } })).toContain(
      'thresholds.targetMaxMgDl',
    );
    expect(errorPaths({ ...valid, thresholds: { ...t, veryHighMgDl: 150 } })).toEqual([
      'thresholds.veryHighMgDl',
    ]);
  });

  it('refuse des seuils égaux ou hors des bornes plausibles (20 à 600 mg/dL) ou non entiers', () => {
    const t = valid.thresholds;
    expect(thresholdsSchema.safeParse({ ...t, targetMinMgDl: 54 }).success).toBe(false);
    expect(thresholdsSchema.safeParse({ ...t, veryLowMgDl: 10 }).success).toBe(false);
    expect(thresholdsSchema.safeParse({ ...t, veryHighMgDl: 700 }).success).toBe(false);
    expect(thresholdsSchema.safeParse({ ...t, targetMaxMgDl: 180.5 }).success).toBe(false);
  });

  it('refuse une date de naissance dans le futur ou invalide', () => {
    expect(errorPaths({ ...valid, birthDate: '2999-01-01', diagnosisYear: undefined })).toEqual([
      'birthDate',
    ]);
    expect(errorPaths({ ...valid, birthDate: '1850-01-01' })).toEqual(['birthDate']);
    expect(errorPaths({ ...valid, birthDate: '14/05/1980' })).toContain('birthDate');
  });

  it('refuse une année de diagnostic future ou antérieure à la naissance', () => {
    expect(errorPaths({ ...valid, diagnosisYear: 2999 })).toEqual(['diagnosisYear']);
    expect(errorPaths({ ...valid, diagnosisYear: 1975 })).toEqual(['diagnosisYear']);
  });

  it('calcule « l’année en cours » au moment de la validation, pas au chargement du module', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T12:00:00Z'));
    expect(patientProfileSchema.safeParse({ ...valid, diagnosisYear: 2027 }).success).toBe(false);

    vi.setSystemTime(new Date('2027-01-02T12:00:00Z')); // le même module, un an plus tard
    expect(patientProfileSchema.safeParse({ ...valid, diagnosisYear: 2027 }).success).toBe(true);
  });

  it('refuse un sexe ou un type de diabète inconnu, et un contact d’urgence sans téléphone', () => {
    expect(errorPaths({ ...valid, sex: 'X' })).toContain('sex');
    expect(errorPaths({ ...valid, diabetesType: 'TYPE_3' })).toContain('diabetesType');
    expect(errorPaths({ ...valid, emergencyContact: { name: 'Marie' } })).toContain(
      'emergencyContact.phone',
    );
  });
});
