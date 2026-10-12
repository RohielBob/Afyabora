// Tests du ticket L9-10 : liste des conversations et lecteur de fiches (fonctions pures, sans écran).
import type { AssistantConversationDto } from '@glyka/shared';
import en from '@/i18n/en.json';
import fr from '@/i18n/fr.json';
import { mergePage, parseSheetBody, reviewOf, spansOf, whenLabel } from '../library';

const conv = (id: string, updatedAt: string): AssistantConversationDto => ({
  id,
  preview: `Question ${id}`,
  messageCount: 2,
  createdAt: updatedAt,
  updatedAt,
});

describe('liste des conversations', () => {
  it('pages fusionnées sans doublon, la plus récemment utilisée d’abord', () => {
    const first = [conv('b', '2026-10-12T09:00:00Z'), conv('a', '2026-10-11T09:00:00Z')];
    const second = [conv('a', '2026-10-11T09:00:00Z'), conv('c', '2026-10-10T09:00:00Z')];
    expect(mergePage(first, second).map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it('une conversation reprise remonte en tête (version la plus récente gardée)', () => {
    const list = [conv('b', '2026-10-12T09:00:00Z'), conv('a', '2026-10-11T09:00:00Z')];
    const merged = mergePage(list, [{ ...conv('a', '2026-10-12T10:00:00Z'), messageCount: 4 }]);
    expect(merged.map((c) => c.id)).toEqual(['a', 'b']);
    expect(merged[0]?.messageCount).toBe(4);
  });

  it('même moment : ordre stable par identifiant (comme le serveur)', () => {
    const t = '2026-10-12T09:00:00Z';
    expect(mergePage([], [conv('a', t), conv('c', t), conv('b', t)]).map((c) => c.id)).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  it('date : aujourd’hui, hier, puis la date (jour du téléphone)', () => {
    const now = new Date(2026, 9, 12, 10, 0);
    expect(whenLabel(new Date(2026, 9, 12, 0, 5).toISOString(), now).kind).toBe('today');
    expect(whenLabel(new Date(2026, 9, 11, 23, 59).toISOString(), now).kind).toBe('yesterday');
    expect(whenLabel(new Date(2026, 9, 11, 0, 1).toISOString(), now).kind).toBe('yesterday');
    expect(whenLabel(new Date(2026, 9, 10, 23, 59).toISOString(), now).kind).toBe('date');
    // Horloge du téléphone un peu en retard : une date « future » reste « aujourd'hui ».
    expect(whenLabel(new Date(2026, 9, 12, 10, 5).toISOString(), now).kind).toBe('today');
    expect(whenLabel(new Date(2026, 9, 13, 8, 0).toISOString(), now).kind).toBe('today');
  });
});

describe('lecteur de fiches : Markdown simple des fiches', () => {
  it('gras : « **…** » ; un « ** » sans fin reste du texte', () => {
    expect(spansOf('Le **sucre rapide** aide')).toEqual([
      { text: 'Le ', bold: false },
      { text: 'sucre rapide', bold: true },
      { text: ' aide', bold: false },
    ]);
    expect(spansOf('**Tout**')).toEqual([{ text: 'Tout', bold: true }]);
    expect(spansOf('**a** et **b**')).toEqual([
      { text: 'a', bold: true },
      { text: ' et ', bold: false },
      { text: 'b', bold: true },
    ]);
    expect(spansOf('a ** b')).toEqual([{ text: 'a ** b', bold: false }]);
    expect(spansOf('')).toEqual([]);
  });

  it('titres, paragraphes (lignes réunies), listes, lignes vides', () => {
    const body = [
      '## De quoi parle-t-on ?',
      '',
      'Première ligne',
      'suite du paragraphe.',
      '',
      'Si la personne peut avaler :',
      '',
      '- arrêter ce qu’elle fait ;',
      '- prendre **15 g** de sucre.',
      '',
      '## Ensuite',
      'Texte final.',
    ].join('\n');
    expect(parseSheetBody(body)).toEqual([
      { type: 'heading', text: 'De quoi parle-t-on ?' },
      { type: 'paragraph', spans: [{ text: 'Première ligne suite du paragraphe.', bold: false }] },
      { type: 'paragraph', spans: [{ text: 'Si la personne peut avaler :', bold: false }] },
      {
        type: 'list',
        items: [
          [{ text: 'arrêter ce qu’elle fait ;', bold: false }],
          [
            { text: 'prendre ', bold: false },
            { text: '15 g', bold: true },
            { text: ' de sucre.', bold: false },
          ],
        ],
      },
      { type: 'heading', text: 'Ensuite' },
      { type: 'paragraph', spans: [{ text: 'Texte final.', bold: false }] },
    ]);
  });

  it('paragraphe collé à une liste, puis liste suivie d’un paragraphe sans ligne vide', () => {
    expect(parseSheetBody('Avant :\n- un\n- deux\nAprès.\r\n')).toEqual([
      { type: 'paragraph', spans: [{ text: 'Avant :', bold: false }] },
      {
        type: 'list',
        items: [[{ text: 'un', bold: false }], [{ text: 'deux', bold: false }]],
      },
      { type: 'paragraph', spans: [{ text: 'Après.', bold: false }] },
    ]);
  });

  it('« ## » sans espace n’est pas un titre (format des fiches : « ## Titre »)', () => {
    expect(parseSheetBody('##collé')).toEqual([
      { type: 'paragraph', spans: [{ text: '##collé', bold: false }] },
    ]);
  });

  it('élément de liste sur deux lignes (suite indentée)', () => {
    expect(parseSheetBody('- un élément\n  qui continue')).toEqual([
      {
        type: 'list',
        items: [
          [
            { text: 'un élément', bold: false },
            { text: ' qui continue', bold: false },
          ],
        ],
      },
    ]);
  });

  it('relecture : validée avec sa date, ou brouillon', () => {
    expect(reviewOf({ status: 'VALIDATED', reviewedOn: '2026-10-12' })).toEqual({
      kind: 'validated',
      reviewedOn: new Date('2026-10-12T12:00:00Z'),
    });
    expect(reviewOf({ status: 'VALIDATED', reviewedOn: null })).toEqual({
      kind: 'validated',
      reviewedOn: null,
    });
    expect(reviewOf({ status: 'DRAFT', reviewedOn: '2026-10-12' })).toEqual({ kind: 'draft' });
  });
});

describe('traductions de L9-10', () => {
  it('pluriels et textes présents en français et en anglais', () => {
    for (const dict of [fr, en]) {
      const a = (dict as unknown as { assistant: Record<string, Record<string, string>> })
        .assistant;
      expect(a.list?.messages_one).toContain('{{count}}');
      expect(a.list?.messages_other).toContain('{{count}}');
      expect(a.sheets?.reviewedOn).toContain('{{date}}');
      expect(typeof a.source?.openHint).toBe('string');
    }
  });
});
