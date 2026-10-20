// Taille des textes de l'image de la carte d'urgence (L6-06) : une seule ligne, centrée, dans une image de
// 360 px de large. Selon la langue, une ligne peut être bien plus longue (« CARTE D'URGENCE » : 15 caractères,
// « TARJETA DE EMERGENCIA » : 21) : la taille est réduite JUSTE ce qu'il faut pour tenir, jamais agrandie.
// Estimation par caractère (police Plus Jakarta Sans) : volontairement large, pour ne jamais déborder.

/** Largeur moyenne d'un caractère, en fraction de la taille de police. */
export const CHAR_WIDTH = {
  /** Majuscules en gras très épais (titre). */
  upperExtraBold: 0.74,
  /** Texte courant en gras (consigne). */
  bold: 0.58,
  /** Texte courant moyen (public visé). */
  medium: 0.56,
} as const;

/** Plus petite taille acceptée : en dessous, le texte deviendrait illisible une fois imprimé. */
export const MIN_FONT_SIZE = 10;

/**
 * Taille de police pour que `text` tienne dans `maxWidth` : `maxSize` si c'est possible, sinon la taille
 * réduite (arrondie vers le bas, jamais sous MIN_FONT_SIZE).
 */
export function fitFontSize(
  text: string,
  maxSize: number,
  maxWidth: number,
  charWidth: number,
  letterSpacing = 0,
): number {
  const length = [...text].length;
  if (length === 0) return maxSize;
  const width = (size: number) => length * (size * charWidth + letterSpacing);
  if (width(maxSize) <= maxWidth) return maxSize;
  const fitted = Math.floor((maxWidth / length - letterSpacing) / charWidth);
  return Math.max(MIN_FONT_SIZE, Math.min(maxSize, fitted));
}
