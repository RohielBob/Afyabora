// Couleurs du rapport PDF (L6-01) : EXACTEMENT celles du système de design (@glyka/ui-tokens, ADR-0008), en
// thème clair (le papier est blanc). L'API ne dépend pas de @glyka/ui-tokens (pas de dépendance ajoutée) :
// les valeurs sont recopiées ici, et test/report-pdf.test.ts vérifie qu'elles sont identiques au fichier
// source des jetons (une modification de la palette fait échouer le test).
//  - Rouge Afyabora : seulement la marque (bandeau du titre), JAMAIS un état glycémique.
//  - États glycémiques : palette dédiée sans rouge (violets en dessous, vert dans la cible, ambre / orange
//    brûlé au-dessus), toujours accompagnée d'une forme (▼ ● ▲) ou d'un mot : le rapport reste lisible
//    imprimé en noir et blanc.
import type { GlucoseState } from '@glyka/shared';

export const brandRed = '#E4002B'; // brand.red
export const brandNavy = '#0B3366'; // brand.navy (« Afya » du logo)

/** Encres (ink) : texte, traits, fonds discrets. */
export const ink = {
  text: '#191D24', // ink[900]
  muted: '#5B6475', // ink[600]
  subtle: '#7A8394', // ink[500]
  border: '#E3E6EC', // ink[200]
  borderStrong: '#CDD2DB', // ink[300]
  surfaceMuted: '#F7F8FA', // ink[50]
  surface: '#FFFFFF', // ink[0]
} as const;

/** glucoseStates.light : fg (texte / symbole), bg (fond), border. */
export const statePalette: Record<GlucoseState, { fg: string; bg: string; border: string }> = {
  VERY_LOW: { fg: '#FFFFFF', bg: '#5B21B6', border: '#5B21B6' },
  LOW: { fg: '#5B21B6', bg: '#F1EBFF', border: '#D9CCFF' },
  IN_RANGE: { fg: '#166534', bg: '#E5F7EC', border: '#B7E6C8' },
  HIGH: { fg: '#92400E', bg: '#FEF3DC', border: '#F7D9A0' },
  VERY_HIGH: { fg: '#FFFFFF', bg: '#9A3412', border: '#9A3412' },
};

/** Couleur PLEINE d'un état (point du graphique, part de la barre de répartition). */
export const stateSolid = (state: GlucoseState): string =>
  state === 'VERY_LOW' || state === 'VERY_HIGH' ? statePalette[state].bg : statePalette[state].fg;
