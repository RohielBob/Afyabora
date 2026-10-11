// Ticket L9-01 : schémas de l'assistant « Afyabora » (contrat 0.4.0).
import { describe, expect, it } from 'vitest';
import {
  assistantConversationDetailSchema,
  assistantListQuerySchema,
  assistantMessageDtoSchema,
  createAssistantConversationSchema,
  knowledgeSheetIdSchema,
  knowledgeSheetSchema,
  sendAssistantMessageSchema,
} from '../src';

const CONV = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const MSG = 'd2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f6a';
const AT = '2026-10-11T14:00:00Z';

const answer = (over: Record<string, unknown> = {}) => ({
  id: MSG,
  conversationId: CONV,
  role: 'ASSISTANT',
  status: 'READY',
  kind: 'SHEET',
  text: 'D’après la fiche…',
  sources: [{ id: 'hypoglycemie', title: 'Hypoglycémie', status: 'DRAFT' }],
  rephrased: false,
  createdAt: AT,
  ...over,
});

describe('sendAssistantMessageSchema : la question du patient', () => {
  it('accepte une question et retire les espaces autour', () => {
    const parsed = sendAssistantMessageSchema.parse({ id: MSG, text: '  C’est quoi l’HbA1c ?  ' });
    expect(parsed.text).toBe('C’est quoi l’HbA1c ?');
  });

  it('refuse une question vide, d’un seul caractère ou de plus de 500 caractères', () => {
    expect(sendAssistantMessageSchema.safeParse({ id: MSG, text: '   ' }).success).toBe(false);
    expect(sendAssistantMessageSchema.safeParse({ id: MSG, text: 'a' }).success).toBe(false);
    expect(sendAssistantMessageSchema.safeParse({ id: MSG, text: 'x'.repeat(500) }).success).toBe(
      true,
    );
    expect(sendAssistantMessageSchema.safeParse({ id: MSG, text: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });

  it('exige un identifiant UUID créé sur le téléphone (rejeu sans doublon)', () => {
    expect(sendAssistantMessageSchema.safeParse({ text: 'Bonjour ?' }).success).toBe(false);
    expect(sendAssistantMessageSchema.safeParse({ id: '42', text: 'Bonjour ?' }).success).toBe(
      false,
    );
    expect(createAssistantConversationSchema.safeParse({ id: CONV }).success).toBe(true);
    expect(createAssistantConversationSchema.safeParse({}).success).toBe(false);
  });
});

describe('assistantListQuerySchema', () => {
  it('20 conversations par page par défaut, 100 au plus', () => {
    expect(assistantListQuerySchema.parse({}).limit).toBe(20);
    expect(assistantListQuerySchema.parse({ limit: '100' }).limit).toBe(100);
    expect(assistantListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(assistantListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });
});

describe('assistantMessageDtoSchema : messages renvoyés au téléphone', () => {
  it('accepte une réponse prête qui cite une fiche', () => {
    expect(assistantMessageDtoSchema.safeParse(answer()).success).toBe(true);
  });

  it('accepte une réponse en préparation (sans texte ni nature)', () => {
    const pending = answer({ status: 'PENDING', kind: null, text: null, sources: [] });
    expect(assistantMessageDtoSchema.safeParse(pending).success).toBe(true);
  });

  it('refuse une nature, un rôle ou un statut inconnus', () => {
    expect(assistantMessageDtoSchema.safeParse(answer({ kind: 'DIAGNOSIS' })).success).toBe(false);
    expect(assistantMessageDtoSchema.safeParse(answer({ role: 'DOCTOR' })).success).toBe(false);
    expect(assistantMessageDtoSchema.safeParse(answer({ status: 'DONE' })).success).toBe(false);
  });

  it('une conversation détaillée contient ses messages', () => {
    const detail = {
      id: CONV,
      preview: 'C’est quoi une hypoglycémie ?',
      messageCount: 1,
      createdAt: AT,
      updatedAt: AT,
      messages: [answer()],
    };
    expect(assistantConversationDetailSchema.safeParse(detail).success).toBe(true);
    expect(
      assistantConversationDetailSchema.safeParse({ ...detail, preview: 'x'.repeat(81) }).success,
    ).toBe(false);
  });
});

describe('fiches de connaissances', () => {
  it('identifiant lisible : minuscules, chiffres, tirets simples', () => {
    for (const ok of ['hypoglycemie', 'hba1c', 'preparer-une-consultation']) {
      expect(knowledgeSheetIdSchema.safeParse(ok).success).toBe(true);
    }
    for (const bad of ['Hypo', 'hypo glycemie', '-hypo', 'hypo--x', '../etc', 'é']) {
      expect(knowledgeSheetIdSchema.safeParse(bad).success).toBe(false);
    }
  });

  const sheet = {
    id: 'hypoglycemie',
    title: 'Hypoglycémie',
    summary: 'Les signes et les gestes recommandés.',
    status: 'DRAFT',
    version: 1,
    reviewedOn: null,
    body: '## Les signes',
    sources: [{ label: 'OMS', url: 'https://www.who.int/fr' }],
    reviewedBy: null,
  };

  it('une fiche cite au moins une source publique', () => {
    expect(knowledgeSheetSchema.safeParse(sheet).success).toBe(true);
    expect(knowledgeSheetSchema.safeParse({ ...sheet, sources: [] }).success).toBe(false);
    expect(
      knowledgeSheetSchema.safeParse({ ...sheet, sources: [{ label: 'OMS', url: 'pas une url' }] })
        .success,
    ).toBe(false);
  });

  it('une fiche validée porte la date et le nom du médecin relecteur', () => {
    const validated = {
      ...sheet,
      status: 'VALIDATED',
      reviewedOn: '2026-10-20',
      reviewedBy: 'Dr Demo',
    };
    expect(knowledgeSheetSchema.safeParse(validated).success).toBe(true);
  });
});
