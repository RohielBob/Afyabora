// Garde-fous du contrat OpenAPI gelé (docs/api/openapi.v0.json, ticket L0-07).
// Ces tests échouent si le contrat se contredit, ou s'il s'écarte des schémas Zod de @glyka/shared.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_ANSWER_KINDS,
  ASSISTANT_MESSAGE_ROLES,
  ASSISTANT_MESSAGE_STATUSES,
  askInsightSchema,
  assistantConversationDetailSchema,
  assistantConversationDtoSchema,
  assistantConversationListSchema,
  assistantMessageDtoSchema,
  claimShareSchema,
  createLifeEventSchema,
  createMeasurementSchema,
  createShareSchema,
  deleteAccountSchema,
  DIABETES_TYPES,
  DOCTOR_VERIFICATION_STATUSES,
  emergencyCardSchema,
  forgotPasswordSchema,
  GLUCOSE_STATES,
  GLUCOSE_UNITS,
  IMPORT_ROW_STATUSES,
  importCommitSchema,
  importPreviewFormSchema,
  INSIGHT_SEVERITIES,
  INSIGHT_TYPES,
  KNOWLEDGE_SHEET_STATUSES,
  knowledgeSheetListSchema,
  knowledgeSheetSchema,
  knowledgeSheetSummarySchema,
  LIFE_EVENT_TYPES,
  loginSchema,
  measurementDtoSchema,
  MEASUREMENT_CONTEXTS,
  MEASUREMENT_SOURCES,
  notificationPreferencesSchema,
  patientProfileSchema,
  QUALITY_LEVELS,
  refreshSchema,
  registerDeviceSchema,
  registerDoctorSchema,
  registerPatientSchema,
  resetPasswordSchema,
  createAssistantConversationSchema,
  sendAssistantMessageResponseSchema,
  sendAssistantMessageSchema,
  SHARE_CATEGORIES,
  SHARE_DURATIONS,
  SHARE_STATUSES,
  SYNC_ENTITIES,
  SYNC_OP_RESULTS,
  SYNC_OP_TYPES,
  syncPushRequestSchema,
  updateLifeEventSchema,
  updateMeasurementSchema,
  USER_ROLES,
  verifyEmailSchema,
  lifeEventDtoSchema,
  unusualValueErrorSchema,
} from '@glyka/shared';

// Le contrat est un document JSON arbitraire : `any` est volontaire ici (permis dans les tests).
type Json = any;

const contract: Json = JSON.parse(
  readFileSync(resolve(__dirname, '../../../docs/api/openapi.v0.json'), 'utf-8'),
);
const schemas: Json = contract.components.schemas;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const operations = (): { method: string; path: string; op: Json }[] =>
  Object.entries<Json>(contract.paths).flatMap(([path, item]) =>
    METHODS.filter((m) => item[m]).map((method) => ({ method, path, op: item[method] })),
  );

const walk = (node: Json, visit: (value: Json) => void) => {
  visit(node);
  if (Array.isArray(node)) node.forEach((child) => walk(child, visit));
  else if (node && typeof node === 'object') Object.values(node).forEach((c) => walk(c, visit));
};

describe('contrat OpenAPI : structure', () => {
  it('est un document OpenAPI 3.0 complet', () => {
    expect(contract.openapi).toMatch(/^3\.0\./);
    expect(contract.info.title).toBe('Glyka API');
    expect(contract.info['x-contract-status']).toBe('frozen-v0');
    expect(contract.servers.length).toBeGreaterThan(0);
  });

  it('toutes les références ($ref) pointent vers un élément qui existe', () => {
    const broken: string[] = [];
    walk(contract, (value) => {
      if (value && typeof value === 'object' && typeof value.$ref === 'string') {
        const parts = value.$ref.replace(/^#\//, '').split('/');
        let target: Json = contract;
        for (const part of parts) target = target?.[part];
        if (target === undefined) broken.push(value.$ref);
      }
    });
    expect(broken).toEqual([]);
  });

  it('chaque opération a un operationId unique, un résumé et un tag déclaré', () => {
    const ids = operations().map(({ op }) => op.operationId);
    expect(
      ids.every((id: unknown) => typeof id === 'string' && /^[a-z][A-Za-z0-9]+$/.test(id)),
    ).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);

    const declared = contract.tags.map((t: Json) => t.name);
    for (const { op } of operations()) {
      expect(typeof op.summary).toBe('string');
      expect(op.summary.length).toBeGreaterThan(3);
      expect(declared).toContain(op.tags[0]);
    }
  });

  it('chaque opération porte ses extensions x-roles, x-lot, x-ticket, x-priority, x-status', () => {
    const roles = [...USER_ROLES, 'PUBLIC'];
    for (const { op } of operations()) {
      expect(
        op['x-roles'].length > 0 && op['x-roles'].every((r: string) => roles.includes(r)),
      ).toBe(true);
      // L9 : assistant de conversation « Afyabora » (contrat 0.4.0).
      expect(/^L[0-9]-\d{2}$/.test(op['x-ticket'])).toBe(true);
      expect(op['x-ticket'].startsWith(op['x-lot'])).toBe(true);
      expect(['P0', 'P1']).toContain(op['x-priority']);
      expect(['implemented', 'planned']).toContain(op['x-status']);
    }
  });

  it('les paramètres de chemin sont tous déclarés, et seulement ceux-là', () => {
    for (const { path, op } of operations()) {
      const inPath = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const declared = (op.parameters ?? [])
        .map((p: Json) => (p.$ref ? contract.components.parameters[p.$ref.split('/').pop()] : p))
        .filter((p: Json) => p.in === 'path')
        .map((p: Json) => p.name);
      expect([...declared].sort()).toEqual([...inPath].sort());
    }
  });

  it('toutes les routes prévues par le cahier des charges sont décrites', () => {
    const expected = [
      'GET /health',
      'POST /auth/register',
      'POST /auth/register-doctor',
      'POST /auth/verify-email',
      'POST /auth/login',
      'POST /auth/refresh',
      'POST /auth/logout',
      'POST /auth/forgot-password',
      'POST /auth/reset-password',
      'GET /me/profile',
      'PUT /me/profile',
      'GET /me/export',
      'DELETE /me',
      'GET /measurements',
      'POST /measurements',
      'PUT /measurements/{id}',
      'DELETE /measurements/{id}',
      'GET /events',
      'POST /events',
      'PUT /events/{id}',
      'DELETE /events/{id}',
      'POST /sync/push',
      'GET /sync/pull',
      'POST /imports/preview',
      'POST /imports/{id}/commit',
      'DELETE /imports/{id}',
      'GET /insights',
      'GET /quality',
      'POST /insights/ask',
      'POST /shares',
      'GET /shares/{id}/token',
      'GET /shares/{id}/status',
      'DELETE /shares/{id}',
      'GET /shares/log',
      'POST /shares/claim',
      'GET /doctor/sessions',
      'GET /doctor/sessions/{sessionId}/summary',
      'GET /doctor/sessions/{sessionId}/measurements',
      'GET /doctor/sessions/{sessionId}/timeline',
      'GET /doctor/sessions/{sessionId}/report',
      'GET /reports/consultation',
      'GET /emergency',
      'PUT /emergency',
      'POST /emergency/regenerate',
      'GET /e/{token}',
      'POST /devices',
      'DELETE /devices/{deviceId}',
      'GET /notifications/preferences',
      'PUT /notifications/preferences',
      // Assistant « Afyabora » (lot L9, contrat 0.4.0)
      'GET /assistant/conversations',
      'POST /assistant/conversations',
      'DELETE /assistant/conversations',
      'GET /assistant/conversations/{id}',
      'DELETE /assistant/conversations/{id}',
      'POST /assistant/conversations/{id}/messages',
      'GET /assistant/sheets',
      'GET /assistant/sheets/{sheetId}',
    ];
    const described = operations().map(({ method, path }) => `${method.toUpperCase()} ${path}`);
    expect([...described].sort()).toEqual([...expected].sort());
  });
});

describe('contrat OpenAPI : sécurité', () => {
  const publicRoutes = [
    'GET /health',
    'POST /auth/register',
    'POST /auth/register-doctor',
    'POST /auth/verify-email',
    'POST /auth/login',
    'POST /auth/refresh',
    'POST /auth/forgot-password',
    'POST /auth/reset-password',
    'GET /e/{token}',
  ];

  it('seules les routes de la liste blanche sont publiques', () => {
    const open = operations()
      .filter(({ op }) => Array.isArray(op.security) && op.security.length === 0)
      .map(({ method, path }) => `${method.toUpperCase()} ${path}`);
    expect([...open].sort()).toEqual([...publicRoutes].sort());
  });

  it('x-roles reste cohérent avec security : PUBLIC si et seulement si la route est ouverte', () => {
    for (const { op } of operations()) {
      const isOpen = Array.isArray(op.security) && op.security.length === 0;
      expect(op['x-roles'].includes('PUBLIC')).toBe(isOpen);
    }
  });

  it('toute route protégée documente la réponse 401', () => {
    for (const { op } of operations()) {
      const isOpen = Array.isArray(op.security) && op.security.length === 0;
      if (!isOpen) expect(op.responses['401']).toBeDefined();
    }
  });

  it('les routes du portail médecin sont réservées aux médecins', () => {
    for (const { path, op } of operations().filter((o) => o.path.startsWith('/doctor/'))) {
      expect(op['x-roles']).toEqual(['DOCTOR']);
      expect(path.includes('{sessionId}') || path === '/doctor/sessions').toBe(true);
    }
  });

  it('chaque opération documente au moins un succès (2xx)', () => {
    for (const { op } of operations()) {
      expect(Object.keys(op.responses).some((code) => code.startsWith('2'))).toBe(true);
    }
  });
});

describe('contrat OpenAPI : énumérations identiques à @glyka/shared', () => {
  const pairs: [string, readonly string[]][] = [
    ['UserRole', USER_ROLES],
    ['DiabetesType', DIABETES_TYPES],
    ['GlucoseUnit', GLUCOSE_UNITS],
    ['MeasurementContext', MEASUREMENT_CONTEXTS],
    ['MeasurementSource', MEASUREMENT_SOURCES],
    ['LifeEventType', LIFE_EVENT_TYPES],
    ['ShareCategory', SHARE_CATEGORIES],
    ['ShareDuration', SHARE_DURATIONS],
    ['ShareStatus', SHARE_STATUSES],
    ['DoctorVerificationStatus', DOCTOR_VERIFICATION_STATUSES],
    ['GlucoseState', GLUCOSE_STATES],
    ['QualityLevel', QUALITY_LEVELS],
    ['InsightType', INSIGHT_TYPES],
    ['InsightSeverity', INSIGHT_SEVERITIES],
    ['SyncEntity', SYNC_ENTITIES],
    ['SyncOpType', SYNC_OP_TYPES],
    ['SyncOpResultCode', SYNC_OP_RESULTS],
    ['ImportRowStatus', IMPORT_ROW_STATUSES],
    ['AssistantMessageRole', ASSISTANT_MESSAGE_ROLES],
    ['AssistantMessageStatus', ASSISTANT_MESSAGE_STATUSES],
    ['AssistantAnswerKind', ASSISTANT_ANSWER_KINDS],
    ['KnowledgeSheetStatus', KNOWLEDGE_SHEET_STATUSES],
  ];

  it.each(pairs)('%s', (name: string, values: readonly string[]) => {
    expect(schemas[name].enum).toEqual([...values]);
  });
});

/** Descend jusqu'au ZodObject, à travers les .refine() / .superRefine(). */
const shapeOf = (schema: Json): Json => {
  let current = schema;
  while (current._def?.schema) current = current._def.schema;
  return current.shape;
};

describe('contrat OpenAPI : requêtes identiques aux schémas Zod', () => {
  // Nom du schéma OpenAPI -> schéma Zod qui valide réellement la requête.
  const requests: [string, Json][] = [
    ['RegisterPatientRequest', registerPatientSchema],
    ['RegisterDoctorRequest', registerDoctorSchema],
    ['LoginRequest', loginSchema],
    ['VerifyEmailRequest', verifyEmailSchema],
    ['RefreshRequest', refreshSchema],
    ['ForgotPasswordRequest', forgotPasswordSchema],
    ['ResetPasswordRequest', resetPasswordSchema],
    ['DeleteAccountRequest', deleteAccountSchema],
    ['PatientProfile', patientProfileSchema],
    ['CreateMeasurementRequest', createMeasurementSchema],
    ['UpdateMeasurementRequest', updateMeasurementSchema],
    ['CreateLifeEventRequest', createLifeEventSchema],
    ['UpdateLifeEventRequest', updateLifeEventSchema],
    ['SyncPushRequest', syncPushRequestSchema],
    ['ImportCommitRequest', importCommitSchema],
    ['CreateShareRequest', createShareSchema],
    ['ClaimShareRequest', claimShareSchema],
    ['AskInsightRequest', askInsightSchema],
    ['EmergencyCardRequest', emergencyCardSchema],
    ['NotificationPreferences', notificationPreferencesSchema],
    ['RegisterDeviceRequest', registerDeviceSchema],
    ['CreateAssistantConversationRequest', createAssistantConversationSchema],
    ['SendAssistantMessageRequest', sendAssistantMessageSchema],
  ];

  it.each(requests)('%s : exemple accepté par le schéma Zod', (name: string, zod: Json) => {
    const result = zod.safeParse(schemas[name].example);
    expect(result.success).toBe(true);
  });

  it.each(requests)('%s : mêmes champs, mêmes champs obligatoires', (name: string, zod: Json) => {
    const shape = shapeOf(zod);
    const documented = Object.keys(schemas[name].properties).sort();
    expect(documented).toEqual(Object.keys(shape).sort());

    const requiredByZod = Object.keys(shape)
      .filter((key) => !shape[key].isOptional())
      .sort();
    expect([...(schemas[name].required ?? [])].sort()).toEqual(requiredByZod);
  });

  it('ImportPreviewRequest : l’exemple multipart est décodé et validé par importPreviewFormSchema', () => {
    const { defaultUnit, mapping } = schemas.ImportPreviewRequest.example;
    const parsed = importPreviewFormSchema.parse({ defaultUnit, mapping });
    expect(parsed.mapping).toEqual({
      date: 'date',
      time: 'heure',
      value: 'glycemie',
      context: 'contexte',
    });
    expect(Object.keys(schemas.ImportPreviewRequest.properties).sort()).toEqual(
      ['defaultUnit', 'file', 'mapping'].sort(),
    );
  });

  it('LifeEvent : exemple et champs identiques à lifeEventDtoSchema (L2-02)', () => {
    expect(lifeEventDtoSchema.safeParse(schemas.LifeEvent.example).success).toBe(true);
    expect(Object.keys(schemas.LifeEvent.properties).sort()).toEqual(
      Object.keys(lifeEventDtoSchema.shape).sort(),
    );
  });

  it('Measurement : exemple et champs identiques à measurementDtoSchema', () => {
    expect(measurementDtoSchema.safeParse(schemas.Measurement.example).success).toBe(true);
    expect(Object.keys(schemas.Measurement.properties).sort()).toEqual(
      Object.keys(measurementDtoSchema.shape).sort(),
    );
  });

  it('UnusualValueError (0.2.1) : exemple et champs identiques à unusualValueErrorSchema', () => {
    const error = schemas.UnusualValueError;
    expect(unusualValueErrorSchema.safeParse(error.example).success).toBe(true);
    const extra = error.allOf[1];
    expect(Object.keys(extra.properties).sort()).toEqual(
      ['plausibleMaxMgDl', 'plausibleMinMgDl', 'valueMgDl'].sort(),
    );
    // Toutes les clés du schéma Zod sont décrites (Error : message, code ; + les trois nombres).
    const documented = [...Object.keys(schemas.Error.properties), ...Object.keys(extra.properties)];
    for (const key of Object.keys(unusualValueErrorSchema.shape)) expect(documented).toContain(key);
  });

  it('chaque corps de requête JSON du contrat est couvert par un schéma Zod', () => {
    const covered = new Set(requests.map(([name]) => name));
    const uncovered: string[] = [];
    for (const { method, path, op } of operations()) {
      const json = op.requestBody?.content?.['application/json'];
      if (!json) continue;
      const name = json.schema.$ref.split('/').pop();
      if (!covered.has(name)) uncovered.push(`${method.toUpperCase()} ${path} -> ${name}`);
    }
    expect(uncovered).toEqual([]);
  });
});

/** Champs et champs obligatoires d'un schéma OpenAPI, y compris à travers `allOf` (schémas étendus). */
const documentedFields = (schema: Json): { properties: string[]; required: string[] } => {
  const parts: Json[] = schema.allOf
    ? schema.allOf.map((p: Json) => (p.$ref ? schemas[p.$ref.split('/').pop()] : p))
    : [schema];
  return {
    properties: parts.flatMap((p) => Object.keys(p.properties ?? {})).sort(),
    required: parts.flatMap((p) => p.required ?? []).sort(),
  };
};

describe('contrat OpenAPI : réponses de l’assistant identiques aux schémas Zod (0.4.0)', () => {
  // Nom du schéma OpenAPI -> schéma Zod avec lequel le mobile lira la réponse.
  const responses: [string, Json][] = [
    ['AssistantMessage', assistantMessageDtoSchema],
    ['AssistantConversation', assistantConversationDtoSchema],
    ['AssistantConversationList', assistantConversationListSchema],
    ['AssistantConversationDetail', assistantConversationDetailSchema],
    ['SendAssistantMessageResponse', sendAssistantMessageResponseSchema],
    ['KnowledgeSheetSummary', knowledgeSheetSummarySchema],
    ['KnowledgeSheetList', knowledgeSheetListSchema],
    ['KnowledgeSheet', knowledgeSheetSchema],
  ];

  it.each(responses)('%s : exemple accepté par le schéma Zod', (name: string, zod: Json) => {
    expect(zod.safeParse(schemas[name].example).success).toBe(true);
  });

  it.each(responses)('%s : mêmes champs, mêmes champs obligatoires', (name: string, zod: Json) => {
    const shape = shapeOf(zod);
    const { properties, required } = documentedFields(schemas[name]);
    expect(properties).toEqual(Object.keys(shape).sort());
    const requiredByZod = Object.keys(shape)
      .filter((key) => !shape[key].isOptional())
      .sort();
    expect(required).toEqual(requiredByZod);
  });

  it('une réponse en préparation (exemple de SendAssistantMessageResponse) n’a ni texte ni nature', () => {
    const { answer } = schemas.SendAssistantMessageResponse.example;
    expect(answer).toMatchObject({ status: 'PENDING', text: null, kind: null, sources: [] });
  });
});

describe('contrat OpenAPI : règles métier visibles dans le contrat', () => {
  it('l’assistant est réservé au patient : le médecin n’accède jamais aux conversations', () => {
    const assistant = operations().filter(({ path }) => path.startsWith('/assistant/'));
    expect(assistant).toHaveLength(8);
    for (const { op } of assistant) {
      expect(op['x-roles']).toEqual(['PATIENT']);
      expect(op['x-lot']).toBe('L9');
    }
  });

  it('la question libre L3-08 est remplacée par l’assistant (dépréciée, pas retirée)', () => {
    const ask = contract.paths['/insights/ask'].post;
    expect(ask.deprecated).toBe(true);
    expect(ask.description).toMatch(/Remplacée par l’assistant/);
  });

  it('les jetons de partage et d’urgence ne contiennent jamais de donnée médicale (documenté)', () => {
    expect(schemas.ShareToken.properties.token.description).toMatch(/JAMAIS de donnée médicale/);
  });

  it('la carte d’urgence précise qu’elle ne contient aucun historique glycémique', () => {
    expect(schemas.EmergencyCardRequest.description).toMatch(/JAMAIS d.historique/);
  });

  it('la glycémie est toujours renvoyée en mg/dL entier', () => {
    expect(schemas.Measurement.properties.valueMgDl.type).toBe('integer');
  });
});
