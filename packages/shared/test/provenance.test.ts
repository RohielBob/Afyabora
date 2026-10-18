// L4-09 : provenance d'une mesure, même règle pour le téléphone et le portail.
import { describe, expect, it } from 'vitest';
import { provenanceOf, shortBatchId } from '../src';

const BATCH = '3f2a1c9e-1111-4111-8111-111111111111';

describe('provenanceOf', () => {
  it('mesure importée : son lot, court et en majuscules', () => {
    expect(provenanceOf('IMPORT', BATCH)).toEqual({ source: 'IMPORT', batch: '3F2A1C' });
  });

  it('importée sans lot connu (lot supprimé) : « Import » seul', () => {
    expect(provenanceOf('IMPORT', null)).toEqual({ source: 'IMPORT', batch: null });
    expect(provenanceOf('IMPORT', undefined)).toEqual({ source: 'IMPORT', batch: null });
  });

  it('saisie ou appareil : jamais de lot, même si un identifiant traîne', () => {
    expect(provenanceOf('MANUAL', BATCH)).toEqual({ source: 'MANUAL', batch: null });
    expect(provenanceOf('DEVICE', null)).toEqual({ source: 'DEVICE', batch: null });
  });
});

describe('shortBatchId', () => {
  it('6 premiers caractères, sans tirets, en majuscules', () => {
    expect(shortBatchId(BATCH)).toBe('3F2A1C');
    expect(shortBatchId('ab-cd-ef12-3456')).toBe('ABCDEF');
  });
});
