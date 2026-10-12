// Tests du ticket L9-09 : présentation des réponses de l'assistant (fonctions pures, sans écran).
import { ASSISTANT_ANSWER_KINDS, KNOWLEDGE_SHEET_STATUSES } from '@glyka/shared';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import {
  KIND_PRESENTATION,
  SOURCE_STATUS,
  SUGGESTIONS,
  emergencyCalls,
  telUri,
} from '../presentation';

/** Valeur d'une clé « a.b.c » dans un fichier de traduction. */
const lookup = (dict: unknown, key: string) =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], dict);

describe('nature d’une réponse : icône ET libellé, jamais la couleur seule', () => {
  it('chaque nature du contrat a une icône et un libellé traduit (fr, en)', () => {
    for (const kind of ASSISTANT_ANSWER_KINDS) {
      const look = KIND_PRESENTATION[kind];
      expect(look.icon).toBeTruthy();
      expect(typeof lookup(fr, look.labelKey)).toBe('string');
      expect(typeof lookup(en, look.labelKey)).toBe('string');
    }
  });

  it('seule l’urgence est en ton « danger »', () => {
    const danger = ASSISTANT_ANSWER_KINDS.filter((k) => KIND_PRESENTATION[k].tone === 'danger');
    expect(danger).toEqual(['EMERGENCY']);
  });

  it('fiche citée : « relue par un médecin » ou « non encore relue », avec une icône différente', () => {
    for (const status of KNOWLEDGE_SHEET_STATUSES) {
      expect(typeof lookup(fr, SOURCE_STATUS[status].labelKey)).toBe('string');
    }
    expect(lookup(fr, SOURCE_STATUS.DRAFT.labelKey)).toBe('Fiche non encore relue');
    expect(SOURCE_STATUS.DRAFT.icon).not.toBe(SOURCE_STATUS.VALIDATED.icon);
  });

  it('les 4 questions proposées sont traduites', () => {
    for (const key of SUGGESTIONS) {
      expect(typeof lookup(fr, `assistant.suggestions.${key}`)).toBe('string');
      expect(typeof lookup(en, `assistant.suggestions.${key}`)).toBe('string');
    }
  });
});

describe('appels d’urgence', () => {
  it('lien tel: : « + » initial et chiffres seulement ; rien sous 3 chiffres', () => {
    expect(telUri('+243 81 234 5678')).toBe('tel:+243812345678');
    expect(telUri(' 112 ')).toBe('tel:112');
    expect(telUri('(081) 234-56-78')).toBe('tel:0812345678');
    expect(telUri('12')).toBeNull();
    expect(telUri('appel')).toBeNull();
  });

  it('dans l’ordre : numéro d’urgence, proche, médecin ; seulement ce qui est enregistré', () => {
    expect(
      emergencyCalls({
        emergencyNumber: '112',
        emergencyContact: { name: 'Marie Kabeya', phone: '+243 81 234 5678' },
        doctorContact: { name: 'Dr Mbuyi', phone: '+243 82 345 6789' },
      }),
    ).toEqual([
      { kind: 'emergency', phone: '112', uri: 'tel:112' },
      {
        kind: 'relative',
        name: 'Marie Kabeya',
        phone: '+243 81 234 5678',
        uri: 'tel:+243812345678',
      },
      { kind: 'doctor', name: 'Dr Mbuyi', phone: '+243 82 345 6789', uri: 'tel:+243823456789' },
    ]);
  });

  it('aucun numéro deviné : profil vide ou absent ⇒ aucune touche d’appel', () => {
    expect(emergencyCalls(null)).toEqual([]);
    expect(emergencyCalls({})).toEqual([]);
    expect(emergencyCalls({ emergencyContact: { name: 'Marie', phone: '12' } })).toEqual([]);
  });
});

describe('traductions de l’assistant', () => {
  it('aucun caractère invisible ou de contrôle (vu en L9-09 : « ? » remplacé par le caractère n° 1, affiché « ≡ »)', () => {
    // Codes refusés : contrôles (< 32), espace insécable (160, sans dessin dans la police de l'app),
    // espaces de largeur nulle et marques de direction (8203 à 8207), séparateurs de ligne (8232, 8233).
    const invisible = (code: number) =>
      code < 32 || code === 160 || (code >= 8203 && code <= 8207) || code === 8232 || code === 8233;
    const values = (node: unknown): string[] =>
      typeof node === 'string'
        ? [node]
        : typeof node === 'object' && node !== null
          ? Object.values(node).flatMap(values)
          : [];
    for (const dict of [fr, en]) {
      for (const value of values((dict as Record<string, unknown>).assistant)) {
        const bad = [...value].filter((c) => invisible(c.charCodeAt(0)));
        expect({ value, bad }).toEqual({ value, bad: [] }); // le texte fautif apparaît dans l’échec
      }
    }
    expect(lookup(fr, 'assistant.suggestions.week')).toBe("Comment s'est passée ma semaine ?");
  });

  it('le français et l’anglais ont exactement les mêmes clés', () => {
    const keys = (node: unknown, prefix = ''): string[] =>
      typeof node === 'object' && node !== null
        ? Object.entries(node).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
        : [prefix];
    expect(keys((en as Record<string, unknown>).assistant).sort()).toEqual(
      keys((fr as Record<string, unknown>).assistant).sort(),
    );
  });
});
