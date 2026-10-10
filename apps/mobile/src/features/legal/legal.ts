// Contenu légal (L1-10) : la politique de confidentialité et l'avertissement « outil d'aide, pas un avis
// médical ». Les textes sont dans i18n (`legal.*`) ; ce fichier fixe l'ORDRE des sections et la version.
// Changer le sens d'un texte légal ⇒ monter LEGAL_VERSION et la date (`legal.date`) dans fr.json et en.json.

/** Version des textes affichée en haut des deux pages. */
export const LEGAL_VERSION = '1.0';

/** Sections de l'avertissement, dans l'ordre d'affichage (clés `legal.disclaimer.<id>.title|body`). */
export const DISCLAIMER_SECTIONS = ['does', 'doesNot', 'quality', 'treatment', 'alerts'] as const;

/** Sections de la politique de confidentialité (clés `legal.privacy.<id>.title|body`). */
export const PRIVACY_SECTIONS = [
  'data',
  'purpose',
  'storage',
  'sharing',
  'emergency',
  'analysis',
  'retention',
  'rights',
] as const;

export type LegalDocumentKind = 'disclaimer' | 'privacy';

/** Clés i18n de chaque section d'un document, dans l'ordre. */
export function legalSections(
  kind: LegalDocumentKind,
): { id: string; title: string; body: string }[] {
  const ids: readonly string[] = kind === 'privacy' ? PRIVACY_SECTIONS : DISCLAIMER_SECTIONS;
  return ids.map((id) => ({
    id,
    title: `legal.${kind}.${id}.title`,
    body: `legal.${kind}.${id}.body`,
  }));
}
