// L4-09 : badge de provenance du portail (même règle et mêmes mots que l'application du patient).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProvenanceBadge, provenanceLabel } from '../ProvenanceBadge';

const BATCH = '3f2a1c9e-1111-4111-8111-111111111111';

describe('provenanceLabel', () => {
  it('saisie, import, import avec lot, appareil', () => {
    expect(provenanceLabel('MANUAL')).toBe('Saisie');
    expect(provenanceLabel('IMPORT', null)).toBe('Import');
    expect(provenanceLabel('IMPORT', BATCH)).toBe('Import · lot 3F2A1C');
    expect(provenanceLabel('DEVICE')).toBe('Appareil');
  });

  it('un lot n’apparaît que pour une mesure importée', () => {
    expect(provenanceLabel('MANUAL', BATCH)).toBe('Saisie');
  });
});

describe('ProvenanceBadge', () => {
  it('icône + texte (jamais la couleur seule), annoncé aux lecteurs d’écran', () => {
    const html = renderToStaticMarkup(<ProvenanceBadge source="IMPORT" importBatchId={BATCH} />);
    expect(html).toContain('aria-label="Provenance : Import · lot 3F2A1C"');
    expect(html).toContain('>Import · lot 3F2A1C<');
    expect(html).toContain('<svg aria-hidden="true"');
    // Couleurs du thème uniquement (clair et sombre), pas de couleur écrite en dur.
    expect(html).toContain('bg-surface-muted');
    expect(html).toContain('text-muted');
    expect(html).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it('chaque provenance a sa propre icône', () => {
    const icons = (['MANUAL', 'IMPORT', 'DEVICE'] as const).map(
      (source) =>
        renderToStaticMarkup(<ProvenanceBadge source={source} />).match(/<svg[\s\S]*<\/svg>/)?.[0],
    );
    expect(new Set(icons).size).toBe(3);
  });
});
