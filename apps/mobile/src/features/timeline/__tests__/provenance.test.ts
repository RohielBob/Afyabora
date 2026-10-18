// L4-09 : texte du badge de provenance (aussi lu par le lecteur d'écran), règle commune avec le portail.
import type { TFunction } from 'i18next';
import { provenanceText } from '../components/ProvenanceBadge';

const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}${JSON.stringify(params)}` : key) as unknown as TFunction;

describe('provenanceText', () => {
  it('import avec son lot court ; import sans lot ; saisie ; appareil', () => {
    expect(provenanceText(t, 'IMPORT', '3f2a1c9e-1111-4111-8111-111111111111')).toBe(
      'timeline.source.importBatch{"batch":"3F2A1C"}',
    );
    expect(provenanceText(t, 'IMPORT', null)).toBe('timeline.source.IMPORT');
    expect(provenanceText(t, 'MANUAL', null)).toBe('timeline.source.MANUAL');
    expect(provenanceText(t, 'DEVICE', null)).toBe('timeline.source.DEVICE');
  });
});
