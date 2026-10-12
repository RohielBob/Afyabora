// Tests du ticket L9-06 : réponses de l'assistant « Afyabora » (tri des questions, mesures, fiches, urgence)
// et routes GET /assistant/sheets.
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { analyzeLastDays, type GlucosePoint, type LastDaysAnalysis } from '@glyka/analytics';
import { knowledgeSheetListSchema, knowledgeSheetSchema } from '@glyka/shared';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import {
  AssistantResponder,
  EMERGENCY_SHEET_ID,
} from '../src/modules/assistant/answers/assistant-responder.service';
import { emergencyAnswer } from '../src/modules/assistant/answers/emergency-answer';
import {
  MEASUREMENT_REMINDER,
  measurementAnswer,
} from '../src/modules/assistant/answers/measurement-answer';
import { focusOf, isMeasurementQuestion, periodOf } from '../src/modules/assistant/answers/routing';
import {
  EXCERPT_MAX,
  SHEET_REMINDER,
  bestSheet,
  sheetAnswer,
} from '../src/modules/assistant/answers/sheet-answer';
import { ASSISTANT_TEMPLATES } from '../src/modules/assistant/answers/template-answer';
import { loadSheets } from '../src/modules/assistant/knowledge/knowledge-sheets';
import { SheetsService, draftsAllowed } from '../src/modules/assistant/knowledge/sheets.service';
import { SheetsController } from '../src/modules/assistant/sheets.controller';
import {
  REFUSAL_ANSWERS,
  normalizeQuestion,
} from '../src/modules/insights/guardrails/question-guard';
import type { InsightsService } from '../src/modules/insights/insights.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const SHEETS = loadSheets();
const n = normalizeQuestion;

// ---------------------------------------------------------------- Tri des questions
describe('tri : question sur MES mesures, ou question générale', () => {
  it.each([
    'Comment s’est passée ma semaine ?',
    'Mes glycémies du soir sont-elles hautes ?',
    'Est-ce que j’ai eu des hypos ce mois-ci ?',
    'Montre-moi mes mesures',
    'Ma glycémie a-t-elle évolué sur 3 mois ?',
    'Combien de fois j’ai été trop bas cette semaine ?',
    'Comment s’est passée la journée pour ma glycémie ?', // « passée » seule désigne le bilan
  ])('mesures : « %s »', (question) => {
    expect(isMeasurementQuestion(n(question))).toBe(true);
  });

  it.each([
    'C’est quoi l’HbA1c ?',
    'Comment lire mes glycémies en mmol/L ?', // demande d'explication : une fiche, pas un bilan
    'Que faire si ma glycémie est trop basse ?',
    'Le sport est-il bon pour le diabète ?',
    'Quels sont les signes d’une hypoglycémie ?',
  ])('générale : « %s »', (question) => {
    expect(isMeasurementQuestion(n(question))).toBe(false);
  });

  it('période demandée : semaine 7 j, deux semaines 14 j, trois mois 90 j, sinon 30 j', () => {
    expect(periodOf(n('Comment s’est passée ma semaine ?'))).toBe(7);
    expect(periodOf(n('Mes glycémies des 7 derniers jours'))).toBe(7);
    expect(periodOf(n('Mes mesures des deux semaines passées'))).toBe(14);
    expect(periodOf(n('Ma glycémie sur 3 mois'))).toBe(90);
    expect(periodOf(n('Montre-moi mes mesures'))).toBe(30);
  });

  it('ce sur quoi la question insiste', () => {
    expect(focusOf(n('Mes glycémies du soir sont-elles hautes ?'))).toEqual([
      'TIME_OF_DAY_PATTERN',
      'HIGH_STREAK',
    ]);
    expect(focusOf(n('J’ai eu des hypos ?'))).toEqual(['REPEATED_HYPO']);
    expect(focusOf(n('Ma glycémie a évolué ?'))).toEqual(['TREND']);
    expect(focusOf(n('Montre-moi mes mesures'))).toEqual([]);
  });
});

// ---------------------------------------------------------------- Recherche dans les fiches
describe('recherche dans les fiches (vraies fiches de apps/api/knowledge)', () => {
  it.each([
    ['C’est quoi l’HbA1c ?', 'hba1c'],
    ['Que faire si ma glycémie est trop basse ?', 'hypoglycemie'],
    ['Quels sont les signes d’une hypoglycémie ?', 'hypoglycemie'],
    ['Combien de sucre prendre en cas d’hypo ?', 'hypoglycemie'],
    ['Pourquoi j’ai soif tout le temps ?', 'hyperglycemie'],
    ['Comment manger quand on est diabétique ?', 'alimentation'],
    ['Le sport est-il bon pour le diabète ?', 'activite-physique'],
    ['Je dors mal, est-ce lié au diabète ?', 'sommeil'],
    ['Je suis stressé, ça joue sur ma glycémie ?', 'stress'],
    ['Comment préparer mon rendez-vous chez le médecin ?', 'preparer-une-consultation'],
    ['C’est quoi le temps dans la cible ?', 'lire-ses-glycemies'],
    ['Comment lire mes glycémies en mmol/L ?', 'lire-ses-glycemies'],
  ])('« %s » ⇒ fiche %s', (question, id) => {
    expect(bestSheet(SHEETS, question)?.sheet.id).toBe(id);
  });

  it.each([
    'Les remboursements du lecteur de glycémie ?', // « glycémie » seul ne désigne aucune fiche
    'Quelle est la capitale du Kenya ?',
    'Recette de pizza ?',
  ])('aucune fiche pour « %s »', (question) => {
    expect(bestSheet(SHEETS, question)).toBeNull();
  });

  it('réponse = titre et résumé de la fiche, la partie la plus proche, le rappel ; la fiche est citée', () => {
    const hypo = SHEETS.find((s) => s.sheet.id === 'hypoglycemie')!;
    const { text, source } = sheetAnswer(hypo, 'Que faire en cas d’hypoglycémie ?');

    expect(source).toEqual({ id: 'hypoglycemie', title: hypo.sheet.title, status: 'DRAFT' });
    expect(
      text.startsWith(`D'après la fiche « ${hypo.sheet.title} » : ${hypo.sheet.summary}`),
    ).toBe(true);
    expect(text).toContain('Les gestes généralement recommandés :');
    expect(text.endsWith(SHEET_REMINDER)).toBe(true);
    expect(text).not.toMatch(/##|\*\*/); // plus de Markdown
  });

  it('un titre de partie qui finit par « ? » ne reçoit pas de « : » en plus', () => {
    const hba1c = SHEETS.find((s) => s.sheet.id === 'hba1c')!;
    const { text } = sheetAnswer(hba1c, 'C’est quoi l’HbA1c ?');
    expect(text).toContain("Qu'est-ce que l'HbA1c ?\n");
    expect(text).not.toContain('? :');
  });

  it('chaque phrase de l’extrait vient de la fiche (rien d’inventé) et il reste court', () => {
    for (const parsed of SHEETS) {
      const { text } = sheetAnswer(parsed, parsed.keywords[0]!);
      const excerpt = text.split('\n\n')[1]!;
      expect(excerpt.length).toBeLessThanOrEqual(EXCERPT_MAX + 2);
      const plainBody = parsed.sheet.body.replace(/\*\*/g, '').replace(/^- /gm, '');
      for (const line of excerpt.replace(/ …$/, '').split('\n')) {
        const clean = line.replace(/^• /, '').replace(/ :$/, '');
        expect(plainBody, `${parsed.sheet.id} : ${clean}`).toContain(clean);
      }
    }
  });
});

// ---------------------------------------------------------------- Réponse sur les mesures
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 12, 21, 0); // 22:00 à Kinshasa (UTC+1)

/** 20 jours de mesures : matins dans la cible, soirs hauts (motif « soir » du moteur). */
function eveningHighs(): GlucosePoint[] {
  const points: GlucosePoint[] = [];
  for (let d = 1; d <= 20; d++) {
    const day = NOW - d * 24 * HOUR;
    points.push({ id: randomUUID(), at: day - 12 * HOUR, mgDl: 110 });
    points.push({ id: randomUUID(), at: day - 1 * HOUR, mgDl: 230 });
  }
  return points;
}
const analysisOf = (points: GlucosePoint[], days = 30): LastDaysAnalysis =>
  analyzeLastDays(points, days, { now: NOW, timeZone: 60 });

describe('réponse sur les mesures : uniquement les phrases du moteur', () => {
  it('résumé de la période, puis l’observation demandée, puis le rappel', () => {
    const analysis = analysisOf(eveningHighs());
    const evening = analysis.insights.find((i) => i.type === 'TIME_OF_DAY_PATTERN')!;
    const text = measurementAnswer(analysis, ['TIME_OF_DAY_PATTERN']);

    expect(evening).toBeDefined();
    expect(text).toBe(`${analysis.summary} ${evening.text} ${MEASUREMENT_REMINDER}`);
  });

  it('ce que le moteur n’a pas relevé est dit simplement, sans dramatiser', () => {
    const text = measurementAnswer(analysisOf(eveningHighs()), ['REPEATED_HYPO']);
    expect(text).toContain("Je n'observe pas de valeurs basses répétées sur cette période.");
  });

  it('comparaison : la phrase du moteur s’il y a une période précédente, sinon « pas assez de mesures »', () => {
    const withPrevious = analysisOf(eveningHighs(), 7); // 20 jours de mesures : période précédente complète
    const noPrevious = analysisOf(eveningHighs().slice(0, 14), 7); // 7 derniers jours seulement
    const comparison = withPrevious.insights.find((i) => i.type === 'PERIOD_COMPARISON')!;

    expect(comparison).toBeDefined(); // le moteur compare dès que les deux périodes ont assez de mesures
    expect(measurementAnswer(withPrevious, ['PERIOD_COMPARISON'])).toContain(comparison.text);
    expect(noPrevious.previousStats).toBeNull();
    expect(measurementAnswer(noPrevious, ['PERIOD_COMPARISON'])).toContain(
      'pas assez de mesures sur la période précédente',
    );
  });

  it('pas assez de mesures : seulement le message du moteur et le rappel', () => {
    const analysis = analysisOf(eveningHighs().slice(0, 4));
    expect(analysis.stats).toBeNull();
    expect(measurementAnswer(analysis, ['TIME_OF_DAY_PATTERN'])).toBe(
      `${analysis.summary} ${MEASUREMENT_REMINDER}`,
    );
  });

  it('chaque nombre de la réponse vient du résumé ou des observations du moteur', () => {
    const analysis = analysisOf(eveningHighs());
    const engine = [analysis.summary, ...analysis.insights.map((i) => i.text)].join(' ');
    const text = measurementAnswer(analysis, ['TIME_OF_DAY_PATTERN', 'TREND', 'ANOMALY']);
    for (const number of text.match(/\d+(?:[.,]\d+)?/g) ?? []) expect(engine).toContain(number);
  });
});

// ---------------------------------------------------------------- Réponse d'urgence
describe('réponse d’urgence : ce que le patient a enregistré, jamais un numéro deviné', () => {
  it('avec numéro, proche et médecin', () => {
    const text = emergencyAnswer({
      emergencyNumber: '112',
      relative: { name: 'Marie Kabeya', phone: '+243 81 234 5678' },
      doctor: { name: 'Dr Mbuyi', phone: '+243 82 345 6789' },
    });
    expect(text).toContain(
      'appelez tout de suite le 112 (votre numéro d’urgence)'.replace('’', "'"),
    );
    expect(text).toContain('Prévenez aussi Marie Kabeya au +243 81 234 5678.');
    expect(text).toContain('Votre médecin : Dr Mbuyi, +243 82 345 6789.');
    expect(text).not.toContain('Pensez à enregistrer');
  });

  it('sans numéro : « les secours », aucun chiffre inventé, invitation à le renseigner', () => {
    const text = emergencyAnswer({ emergencyNumber: null, relative: null, doctor: null });
    expect(text).toContain('appelez tout de suite les secours');
    expect(text).not.toMatch(/\d/);
    expect(text).toContain("Pensez à enregistrer votre numéro d'urgence dans votre profil.");
  });
});

// ---------------------------------------------------------------- Ordre de décision complet
describe('AssistantResponder : l’ordre de décision', () => {
  const patient = randomUUID();
  let analysisCalls: number[] = [];
  let profile: Record<string, unknown> | null = null;

  const responder = (sheets: SheetsService) =>
    new AssistantResponder(
      {
        patientProfile: { findUnique: async () => profile },
      } as unknown as PrismaService,
      {
        engineAnalysis: async (_id: string, days: number) => {
          analysisCalls.push(days);
          return analysisOf(eveningHighs(), days);
        },
      } as unknown as InsightsService,
      sheets,
    );
  const sheetsWith = (env: Record<string, string>) => {
    const service = new SheetsService({ get: (k: string) => env[k] } as unknown as ConfigService);
    service.onModuleInit();
    return service;
  };
  const devSheets = () => sheetsWith({ NODE_ENV: 'development' });

  afterEach(() => {
    analysisCalls = [];
    profile = null;
  });

  it('urgence : avant tout le reste, avec les contacts du profil, et la fiche « Quand demander de l’aide »', async () => {
    profile = {
      emergencyNumber: '112',
      emergencyContactName: 'Marie',
      emergencyContactPhone: '+243 81 000 0000',
      doctorName: null,
      doctorPhone: null,
    };
    const answer = await responder(devSheets()).answer(
      patient,
      'Je fais un malaise après mes mesures du soir',
    );
    expect(answer.kind).toBe('EMERGENCY');
    expect(answer.text).toContain('le 112');
    expect(answer.text).toContain('Marie au +243 81 000 0000');
    expect(answer.sources.map((s) => s.id)).toEqual([EMERGENCY_SHEET_ID]);
    expect(analysisCalls).toEqual([]); // l'urgence n'attend aucun calcul
  });

  it.each([
    ['Combien d’unités d’insuline dois-je prendre ?', REFUSAL_ANSWERS.DOSE],
    ['Est-ce que j’ai un diabète grave ?', REFUSAL_ANSWERS.DIAGNOSIS],
    [
      'Dois-je arrêter mon traitement à cause de mes glycémies du soir ?',
      REFUSAL_ANSWERS.TREATMENT,
    ],
  ])('refus avant les mesures et les fiches : « %s »', async (question, text) => {
    const answer = await responder(devSheets()).answer(patient, question);
    expect(answer).toEqual({ kind: 'REFUSAL', text, sources: [], rephrased: false });
    expect(analysisCalls).toEqual([]);
  });

  it('mesures : analyse du moteur sur la période demandée, sans fiche citée', async () => {
    const answer = await responder(devSheets()).answer(
      patient,
      'Comment s’est passée ma semaine ?',
    );
    expect(answer.kind).toBe('MEASUREMENTS');
    expect(analysisCalls).toEqual([7]);
    expect(answer.text).toContain('Sur les 7 derniers jours');
    expect(answer.sources).toEqual([]);
    expect(answer.rephrased).toBe(false);
  });

  it('question générale « hors sujet » pour le filtre de L3-07, mais une fiche y répond : SHEET', async () => {
    const answer = await responder(devSheets()).answer(patient, 'C’est quoi l’HbA1c ?');
    expect(answer.kind).toBe('SHEET');
    expect(answer.sources.map((s) => s.id)).toEqual(['hba1c']);
    expect(answer.text).toContain('HbA1c');
  });

  it('ni mesures ni fiche : hors sujet, ou « pas de réponse sûre » ; jamais d’invention', async () => {
    const r = responder(devSheets());
    expect((await r.answer(patient, 'Recette de pizza ?')).text).toBe(ASSISTANT_TEMPLATES.offTopic);
    expect((await r.answer(patient, 'Les remboursements du lecteur de glycémie ?')).text).toBe(
      ASSISTANT_TEMPLATES.noSafeAnswer,
    );
  });

  it('en production sans brouillons : aucune fiche non relue n’est citée', async () => {
    const r = responder(sheetsWith({ NODE_ENV: 'production' }));
    expect((await r.answer(patient, 'C’est quoi l’HbA1c ?')).kind).toBe('OUT_OF_SCOPE');
    const emergency = await r.answer(patient, 'Je fais un malaise');
    expect(emergency.kind).toBe('EMERGENCY');
    expect(emergency.sources).toEqual([]);
  });
});

// ---------------------------------------------------------------- Brouillons et routes des fiches
describe('fiches servies : brouillons selon l’environnement', () => {
  it('par défaut : oui hors production, non en production ; réglage explicite prioritaire', () => {
    expect(draftsAllowed('development', undefined)).toBe(true);
    expect(draftsAllowed('test', undefined)).toBe(true);
    expect(draftsAllowed('production', undefined)).toBe(false);
    expect(draftsAllowed('production', 'true')).toBe(true); // démonstration
    expect(draftsAllowed('development', 'false')).toBe(false);
  });
});

describe('GET /assistant/sheets et /{sheetId}', () => {
  const SECRET = 'secret-de-test-uniquement-0123456789abcdef';
  const jwt = new JwtService({ secret: SECRET });
  const token = (role = 'PATIENT') =>
    jwt.sign({ sub: randomUUID(), role }, { expiresIn: 900, algorithm: 'HS256' });

  async function appWith(env: Record<string, string>): Promise<[INestApplication, string]> {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ global: true, secret: SECRET })],
      controllers: [SheetsController],
      providers: [
        SheetsService,
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, '127.0.0.1');
    return [app, `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`];
  }
  const get = (url: string, auth?: string) =>
    fetch(url, { headers: auth ? { authorization: `Bearer ${auth}` } : {} });

  let dev: [INestApplication, string];
  beforeAll(async () => {
    dev = await appWith({ NODE_ENV: 'development' });
    return async () => {
      await dev[0].close();
    };
  });

  it('liste des 10 fiches (sans leur texte), au format du contrat', async () => {
    const res = await get(`${dev[1]}/assistant/sheets`, token());
    const body = knowledgeSheetListSchema.parse(await res.json());
    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(10);
    expect(body.items.every((s) => s.status === 'DRAFT' && s.reviewedOn === null)).toBe(true);
    expect(JSON.stringify(body)).not.toContain('"body"');
  });

  it('une fiche complète ; 404 si inconnue ; 400 si l’identifiant est invalide', async () => {
    const res = await get(`${dev[1]}/assistant/sheets/hba1c`, token());
    const sheet = knowledgeSheetSchema.parse(await res.json());
    expect(sheet.id).toBe('hba1c');
    expect(sheet.sources.length).toBeGreaterThan(0);
    expect((await get(`${dev[1]}/assistant/sheets/inconnue`, token())).status).toBe(404);
    expect((await get(`${dev[1]}/assistant/sheets/Pas%20Valide`, token())).status).toBe(400);
  });

  it('réservées au patient : 403 médecin, 401 sans jeton', async () => {
    expect((await get(`${dev[1]}/assistant/sheets`, token('DOCTOR'))).status).toBe(403);
    expect((await get(`${dev[1]}/assistant/sheets/hba1c`)).status).toBe(401);
  });

  it('en production : aucun brouillon servi (liste vide, 404) ; démonstration explicite : servis', async () => {
    const [prod, prodUrl] = await appWith({ NODE_ENV: 'production' });
    const [demo, demoUrl] = await appWith({
      NODE_ENV: 'production',
      ASSISTANT_DRAFT_SHEETS: 'true',
    });
    try {
      expect(await (await get(`${prodUrl}/assistant/sheets`, token())).json()).toEqual({
        items: [],
      });
      expect((await get(`${prodUrl}/assistant/sheets/hba1c`, token())).status).toBe(404);
      const demoList = (await (await get(`${demoUrl}/assistant/sheets`, token())).json()) as {
        items: unknown[];
      };
      expect(demoList.items).toHaveLength(10);
    } finally {
      await prod.close();
      await demo.close();
    }
  });
});
