// Ticket L1-10 : textes légaux (politique de confidentialité, avertissement « outil d'aide, pas un avis
// médical ») et cohérence des traductions. Un texte légal manquant dans une langue afficherait sa clé brute.
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { DISCLAIMER_SECTIONS, PRIVACY_SECTIONS, legalSections } from '../legal';

type Dict = { [key: string]: string | Dict };

/** Valeur d'une clé « a.b.c » dans un fichier de traduction (undefined si absente). */
function lookup(dict: Dict, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Dict | undefined)?.[part], dict);
}

/** Toutes les clés « feuilles » d'un fichier de traduction. */
function leafKeys(dict: Dict, prefix = ''): string[] {
  return Object.entries(dict).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : leafKeys(v, `${prefix}${k}.`),
  );
}

const LANGS = { fr: fr as Dict, en: en as Dict };

describe('documents légaux', () => {
  it.each(['privacy', 'disclaimer'] as const)(
    '%s : chaque section a un titre et un texte, en français et en anglais',
    (kind) => {
      const sections = legalSections(kind);
      expect(sections.length).toBe(
        (kind === 'privacy' ? PRIVACY_SECTIONS : DISCLAIMER_SECTIONS).length,
      );
      for (const dict of Object.values(LANGS)) {
        for (const { title, body } of sections) {
          expect(typeof lookup(dict, title)).toBe('string');
          expect(String(lookup(dict, body)).length).toBeGreaterThan(40);
        }
        for (const key of ['overline', 'title', 'intro']) {
          expect(typeof lookup(dict, `legal.${kind}.${key}`)).toBe('string');
        }
      }
    },
  );

  it('la politique parle de la carte d’urgence (lisible sans compte, CDC F10)', () => {
    expect(PRIVACY_SECTIONS).toContain('emergency');
  });

  it('l’avertissement dit clairement : ni diagnostic, ni dose', () => {
    const text = String(lookup(LANGS.fr, 'legal.disclaimer.doesNot.body'));
    expect(text).toMatch(/diagnostic/);
    expect(text).toMatch(/dose/);
  });
});

describe('inscription : textes des deux cases (L1-10)', () => {
  it.each(Object.entries(LANGS))(
    '%s : case, libellé accessible, lien et message d’erreur',
    (_, dict) => {
      for (const key of [
        'auth.signUp.consent',
        'auth.signUp.consentA11y',
        'auth.signUp.consentLink',
        'auth.signUp.disclaimer',
        'auth.signUp.disclaimerA11y',
        'auth.signUp.disclaimerLink',
        'auth.validation.consent',
        'auth.validation.disclaimer',
      ]) {
        expect(typeof lookup(dict, key)).toBe('string');
      }
    },
  );
});

describe('traductions', () => {
  it('le français et l’anglais ont exactement les mêmes clés', () => {
    expect(leafKeys(LANGS.en).sort()).toEqual(leafKeys(LANGS.fr).sort());
  });
});
