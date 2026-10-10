// Ticket L2-04 : seuils du patient gardés sur le téléphone (relecture sûre).
import { DEFAULT_THRESHOLDS } from '@glyka/shared';
import { parseStoredThresholds } from '../stored-thresholds';

describe('seuils gardés sur le téléphone', () => {
  const own = { veryLowMgDl: 60, targetMinMgDl: 80, targetMaxMgDl: 160, veryHighMgDl: 220 };

  it('relit les seuils enregistrés', () => {
    expect(parseStoredThresholds(JSON.stringify(own))).toEqual(own);
  });

  it('absents, illisibles ou incohérents : seuils par défaut (le message de sécurité marche toujours)', () => {
    expect(parseStoredThresholds(null)).toEqual(DEFAULT_THRESHOLDS);
    expect(parseStoredThresholds('{pas du json')).toEqual(DEFAULT_THRESHOLDS);
    expect(parseStoredThresholds(JSON.stringify({ veryLowMgDl: 60 }))).toEqual(DEFAULT_THRESHOLDS);
    // Ordre non respecté (très bas au-dessus de la cible).
    expect(parseStoredThresholds(JSON.stringify({ ...own, veryLowMgDl: 90 }))).toEqual(
      DEFAULT_THRESHOLDS,
    );
  });
});
