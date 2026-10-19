// L4-09 : provenance d'une mesure, même règle pour le téléphone et le portail ; code court (L6-04).
import { describe, expect, it } from 'vitest';
import { provenanceOf, shortBatchId, shortCode } from '../src';

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

describe('code court (shortCode)', () => {
  it('6 premiers caractères de l’identifiant, sans tiret, en majuscules', () => {
    expect(shortCode('7ea97249-f951-4671-add5-710f4c6df047')).toBe('7EA972');
    expect(shortCode('3f-2a-1c-9e')).toBe('3F2A1C');
  });

  it('même règle que le lot d’import', () => {
    const id = 'a3dd4122-3e59-4295-888b-5ff2fa2fe6ce';
    expect(shortBatchId(id)).toBe(shortCode(id));
  });
});
