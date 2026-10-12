// Liste des conversations et lecteur de fiches (L9-10) : fonctions PURES, testées sans écran
// (__tests__/library.test.ts).
import type { AssistantConversationDto, KnowledgeSheet } from '@glyka/shared';

// ---------------------------------------------------------------- Liste des conversations

/** Ajoute une page à la liste déjà affichée (sans doublon), de la plus récemment utilisée à la plus ancienne. */
export function mergePage(
  current: readonly AssistantConversationDto[],
  page: readonly AssistantConversationDto[],
): AssistantConversationDto[] {
  const byId = new Map(current.map((c) => [c.id, c]));
  for (const c of page) byId.set(c.id, c);
  return [...byId.values()].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || (a.id < b.id ? 1 : -1),
  );
}

/** Moment d'une conversation : aujourd'hui (heure), hier, ou la date (heure locale du téléphone). */
export type WhenLabel =
  { kind: 'today'; date: Date } | { kind: 'yesterday'; date: Date } | { kind: 'date'; date: Date };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function whenLabel(iso: string, now: Date): WhenLabel {
  const date = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return { kind: 'today', date };
  if (days === 1) return { kind: 'yesterday', date };
  return { kind: 'date', date };
}

// ---------------------------------------------------------------- Lecteur de fiches

/** Morceau de texte, en gras ou non (« **gras** » dans les fiches). */
export interface Span {
  text: string;
  bold: boolean;
}

/** Bloc du texte d'une fiche : le Markdown simple autorisé par les fiches (L9-02). */
export type SheetBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; spans: Span[] }
  | { type: 'list'; items: Span[][] };

/** « Le **sucre** rapide » ⇒ [Le ][sucre (gras)][ rapide]. Un « ** » sans fin reste du texte simple. */
export function spansOf(text: string): Span[] {
  const spans: Span[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) spans.push({ text: text.slice(last, at), bold: false });
    spans.push({ text: match[1] as string, bold: true });
    last = at + match[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last), bold: false });
  return spans;
}

/**
 * Texte d'une fiche ⇒ blocs affichables : titres « ## », paragraphes (lignes consécutives réunies), listes
 * « - ». Rien d'autre n'est permis dans les fiches (contrôlé côté serveur), donc rien d'autre n'est lu.
 */
export function parseSheetBody(body: string): SheetBlock[] {
  const blocks: SheetBlock[] = [];
  let paragraph: string[] = [];
  let list: Span[][] | null = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', spans: spansOf(paragraph.join(' ')) });
    if (list) blocks.push({ type: 'list', items: list });
    paragraph = [];
    list = null;
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') {
      flush();
    } else if (line.startsWith('## ')) {
      flush();
      blocks.push({ type: 'heading', text: line.slice(3).trim() });
    } else if (line.startsWith('- ')) {
      if (paragraph.length) {
        blocks.push({ type: 'paragraph', spans: spansOf(paragraph.join(' ')) });
        paragraph = [];
      }
      (list ??= []).push(spansOf(line.slice(2).trim()));
    } else if (list && /^\s{2,}/.test(raw)) {
      // Suite d'un élément de liste sur la ligne suivante (indentée).
      const items: Span[][] = list;
      const lastItem = items[items.length - 1] as Span[];
      items[items.length - 1] = [...lastItem, ...spansOf(` ${line}`)];
    } else {
      if (list) {
        blocks.push({ type: 'list', items: list });
        list = null;
      }
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** Relecture d'une fiche, telle qu'on la montre au patient. */
export type ReviewLabel = { kind: 'validated'; reviewedOn: Date | null } | { kind: 'draft' };

export function reviewOf(sheet: Pick<KnowledgeSheet, 'status' | 'reviewedOn'>): ReviewLabel {
  if (sheet.status !== 'VALIDATED') return { kind: 'draft' };
  return {
    kind: 'validated',
    reviewedOn: sheet.reviewedOn ? new Date(`${sheet.reviewedOn}T12:00:00Z`) : null,
  };
}
