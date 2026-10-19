// Vérification des comptes médecins par email : contenu des emails, alertes à l'équipe (TeamNotifier) et
// tâche planifiée qui annonce la décision au médecin (DoctorDecisionMailJob).
// Les deux premières parties tournent partout ; la tâche est testée sur une VRAIE base PostgreSQL (réservation
// atomique, nouvel essai après panne), seulement si DATABASE_URL désigne une base « …_test ».
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailService, OutgoingMail } from '../src/common/mail/mail.service';
import { DoctorDecisionMailJob } from '../src/modules/auth/doctor-decision-mail.job';
import {
  buildDoctorDecisionMail,
  buildTeamDecisionSentMail,
  buildTeamDoctorRegisteredMail,
  buildTeamDoctorToReviewMail,
  escapeHtml,
  type DoctorSummary,
} from '../src/modules/auth/doctor-review.mails';
import { TeamNotifier } from '../src/modules/auth/team-notifier';
import type { PrismaService } from '../src/prisma/prisma.service';
import { isTestDatabase } from './support/test-database';

const TEAM = 'equipe@afyabora.test';
const PORTAL = 'https://portail.afyabora.test';

const amina: DoctorSummary = {
  email: 'dr.amina@example.org',
  firstName: 'Amina',
  lastName: 'Diallo',
  licenseNumber: 'CD-12345',
  institution: 'Clinique Ngaliema',
};

/** Faux service d'envoi : garde les emails ; `failNext` fait échouer les prochains envois. */
function fakeMail() {
  const sent: OutgoingMail[] = [];
  let failures = 0;
  const service = {
    send: async (mail: OutgoingMail) => {
      if (failures > 0) {
        failures--;
        throw Object.assign(new Error(`SMTP refusé pour ${mail.to}`), { name: 'SmtpError' });
      }
      sent.push(mail);
    },
  };
  return {
    sent,
    service: service as unknown as MailService,
    failNext: (n = 1) => (failures = n),
  };
}

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Configuration absente du test : ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

/** Laisse partir les envois « non attendus » (TeamNotifier.notify). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.restoreAllMocks());

describe('contenu des emails', () => {
  it('escapeHtml : les 5 caractères spéciaux du HTML', () => {
    expect(escapeHtml(`<a href="x">L'été & co</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;L&#39;été &amp; co&lt;/a&gt;',
    );
  });

  it('nouvelle inscription (équipe) : la fiche complète, rien à faire tout de suite', () => {
    const mail = buildTeamDoctorRegisteredMail(TEAM, amina);
    expect(mail.to).toBe(TEAM);
    expect(mail.subject).toBe('Afyabora : nouvelle inscription médecin');
    for (const value of ['Dr Amina Diallo', amina.email, 'CD-12345', 'Clinique Ngaliema']) {
      expect(mail.text).toContain(value);
      expect(mail.html).toContain(value);
    }
    expect(mail.text).toContain('pas encore confirmée');
  });

  it('médecin à vérifier (équipe) : les deux commandes prêtes à copier', () => {
    const mail = buildTeamDoctorToReviewMail(TEAM, amina);
    expect(mail.subject).toBe('Afyabora : un médecin attend votre vérification');
    expect(mail.text).toContain('pnpm admin:doctors approve dr.amina@example.org');
    expect(mail.text).toContain('pnpm admin:doctors reject dr.amina@example.org');
    expect(mail.html).toContain('<code>pnpm admin:doctors approve dr.amina@example.org</code>');
  });

  it('champs saisis par le médecin : échappés dans le HTML, jamais dans l’objet', () => {
    const tricky: DoctorSummary = {
      ...amina,
      firstName: '<script>alert(1)</script>',
      lastName: '<a href="https://piege.test">Cliquez</a>',
      institution: 'Clinique "Saint" & Fils',
    };
    for (const mail of [
      buildTeamDoctorRegisteredMail(TEAM, tricky),
      buildTeamDoctorToReviewMail(TEAM, tricky),
      buildTeamDecisionSentMail(TEAM, tricky, 'APPROVED'),
      buildDoctorDecisionMail({
        to: tricky.email,
        decision: 'APPROVED',
        firstName: tricky.firstName,
        lastName: tricky.lastName,
        portalUrl: PORTAL,
        canReply: false,
      }),
    ]) {
      expect(mail.html).not.toContain('<script>');
      expect(mail.html).not.toContain('<a href="https://piege.test"');
      expect(mail.html).toContain('&lt;script&gt;');
      expect(mail.subject).not.toMatch(/alert|piege|Saint/);
    }
    expect(buildTeamDoctorRegisteredMail(TEAM, tricky).html).toContain(
      'Clinique &quot;Saint&quot; &amp; Fils',
    );
  });

  it('compte approuvé (médecin) : lien de connexion, se reconnecter ; réponse possible si demandé', () => {
    const base = {
      to: amina.email,
      decision: 'APPROVED' as const,
      firstName: 'Amina',
      lastName: 'Diallo',
      portalUrl: PORTAL,
    };
    const mail = buildDoctorDecisionMail({ ...base, canReply: true });
    expect(mail.to).toBe(amina.email);
    expect(mail.subject).toBe('Afyabora : votre compte professionnel est approuvé');
    expect(mail.text).toContain('Bonjour Dr Amina Diallo,');
    expect(mail.text).toContain(`Se connecter : ${PORTAL}/login`);
    expect(mail.html).toContain(`<a href="${PORTAL}/login">`);
    expect(mail.text).toContain('reconnectez-vous');
    expect(mail.text).toContain('répondez simplement à cet email');

    // Sans boîte de l'équipe, une réponse n'arriverait nulle part : la phrase disparaît.
    const noReply = buildDoctorDecisionMail({ ...base, canReply: false });
    expect(noReply.text).not.toContain('répondez');
    expect(noReply.html).not.toContain('répondez');
  });

  it('compte refusé (médecin) : pas de lien de connexion, aucun accès aux dossiers', () => {
    const mail = buildDoctorDecisionMail({
      to: amina.email,
      decision: 'REJECTED',
      firstName: 'Amina',
      lastName: 'Diallo',
      portalUrl: PORTAL,
      canReply: true,
    });
    expect(mail.subject).toBe('Afyabora : votre compte professionnel n’a pas été validé');
    expect(mail.text).toContain('ne permet pas d’accéder aux dossiers');
    expect(mail.text).not.toContain('/login');
    expect(mail.text).toContain('répondez simplement à cet email');
  });

  it('copie à l’équipe : la décision et la fiche', () => {
    expect(buildTeamDecisionSentMail(TEAM, amina, 'APPROVED').subject).toBe(
      'Afyabora : médecin prévenu (compte approuvé)',
    );
    const rejected = buildTeamDecisionSentMail(TEAM, amina, 'REJECTED');
    expect(rejected.subject).toBe('Afyabora : médecin prévenu (compte refusé)');
    expect(rejected.text).toContain('compte REFUSÉ');
    expect(rejected.text).toContain(amina.email);
  });
});

describe('TeamNotifier', () => {
  it('boîte non configurée (absente ou vide) : rien n’est envoyé', async () => {
    for (const value of [undefined, '']) {
      const mail = fakeMail();
      const notifier = new TeamNotifier(mail.service, fakeConfig({ TEAM_NOTIFY_EMAIL: value }));
      expect(notifier.address).toBeUndefined();
      notifier.notify((to) => buildTeamDoctorRegisteredMail(to, amina));
      await flush();
      expect(mail.sent).toHaveLength(0);
    }
  });

  it('boîte configurée : l’alerte lui est adressée', async () => {
    const mail = fakeMail();
    const notifier = new TeamNotifier(mail.service, fakeConfig({ TEAM_NOTIFY_EMAIL: TEAM }));
    notifier.notify((to) => buildTeamDoctorRegisteredMail(to, amina));
    await flush();
    expect(mail.sent.map((m) => m.to)).toEqual([TEAM]);
  });

  it('panne d’envoi : pas d’exception, une erreur journalisée SANS adresse ni contenu', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const mail = fakeMail();
    mail.failNext();
    const notifier = new TeamNotifier(mail.service, fakeConfig({ TEAM_NOTIFY_EMAIL: TEAM }));
    expect(() => notifier.notify((to) => buildTeamDoctorRegisteredMail(to, amina))).not.toThrow();
    await flush();
    expect(error).toHaveBeenCalledTimes(1);
    const message = String(error.mock.calls[0]?.[0]);
    expect(message).toContain('SmtpError');
    expect(message).not.toContain(TEAM);
    expect(message).not.toContain('amina');
  });
});

describe('DoctorDecisionMailJob : planification', () => {
  it('enregistrée auprès du planificateur, chaque minute', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        {
          provide: DoctorDecisionMailJob,
          useValue: new DoctorDecisionMailJob(
            {} as PrismaService,
            fakeMail().service,
            fakeConfig({}),
            new TeamNotifier(fakeMail().service, fakeConfig({})),
          ),
        },
      ],
    }).compile();
    await moduleRef.init();
    try {
      const job = moduleRef.get(SchedulerRegistry).getCronJob('doctor-decision-mail');
      expect(String(job.cronTime.source)).toBe('*/1 * * * *');
    } finally {
      await moduleRef.close();
    }
  });

  it('base injoignable : 0 email, un avertissement sans donnée, pas d’exception', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const broken = {
      doctorProfile: {
        findMany: async () => {
          throw Object.assign(new Error('dr.amina@example.org'), { name: 'PrismaError' });
        },
      },
    } as unknown as PrismaService;
    const job = new DoctorDecisionMailJob(
      broken,
      fakeMail().service,
      fakeConfig({ PORTAL_URL: PORTAL }),
      new TeamNotifier(fakeMail().service, fakeConfig({})),
    );
    await expect(job.run()).resolves.toBe(0);
    expect(String(warn.mock.calls[0]?.[0])).toContain('PrismaError');
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('amina');
  });
});

const DB_URL = process.env.DATABASE_URL;

describe.skipIf(!isTestDatabase(DB_URL))('DoctorDecisionMailJob (vraie base)', () => {
  let prisma: PrismaClient;
  const created: string[] = [];

  /** Crée un médecin ; renvoie son identifiant. */
  async function addDoctor(
    status: 'PENDING' | 'APPROVED' | 'REJECTED',
    decisionEmailPending: boolean,
  ): Promise<{ id: string; email: string }> {
    const id = randomUUID();
    const email = `dr.${id.slice(0, 8)}@example.org`;
    await prisma.user.create({
      data: {
        id,
        email,
        passwordHash: 'x',
        role: 'DOCTOR',
        emailVerifiedAt: new Date(),
        doctorProfile: {
          create: {
            firstName: 'Amina',
            lastName: 'Diallo',
            licenseNumber: 'CD-12345',
            institution: 'Clinique Ngaliema',
            verificationStatus: status,
            verifiedAt: status === 'PENDING' ? null : new Date(),
            decisionEmailPending,
          },
        },
      },
    });
    created.push(id);
    return { id, email };
  }

  const pendingFlag = async (id: string) =>
    (await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: id } })).decisionEmailPending;

  function makeJob(team: string | null = TEAM) {
    const mail = fakeMail();
    const teamMail = fakeMail();
    const job = new DoctorDecisionMailJob(
      prisma as unknown as PrismaService,
      mail.service,
      fakeConfig({ PORTAL_URL: `${PORTAL}/` }),
      new TeamNotifier(teamMail.service, fakeConfig({ TEAM_NOTIFY_EMAIL: team ?? undefined })),
    );
    return { job, mail, teamMail };
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    await prisma.$connect();
  });

  beforeEach(async () => {
    // Base de test partagée : les marques laissées par d'autres tests ne doivent pas fausser les comptes.
    await prisma.doctorProfile.updateMany({
      where: { decisionEmailPending: true },
      data: { decisionEmailPending: false },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });

  it('compte approuvé à annoncer : email au médecin (réponse vers l’équipe), copie à l’équipe, une seule fois', async () => {
    const doctor = await addDoctor('APPROVED', true);
    const { job, mail, teamMail } = makeJob();

    expect(await job.run()).toBe(1);
    await flush();
    expect(mail.sent).toHaveLength(1);
    const sent = mail.sent[0]!;
    expect(sent.to).toBe(doctor.email);
    expect(sent.subject).toBe('Afyabora : votre compte professionnel est approuvé');
    expect(sent.replyTo).toBe(TEAM);
    expect(sent.text).toContain(`${PORTAL}/login`); // « / » final de PORTAL_URL retiré
    expect(sent.text).not.toContain(`${PORTAL}//login`);
    expect(teamMail.sent.map((m) => m.subject)).toEqual([
      'Afyabora : médecin prévenu (compte approuvé)',
    ]);
    expect(await pendingFlag(doctor.id)).toBe(false);

    // Passage suivant : plus rien à envoyer.
    expect(await job.run()).toBe(0);
    expect(mail.sent).toHaveLength(1);
  });

  it('compte refusé : email « non validé » ; sans boîte de l’équipe, ni Reply-To ni copie', async () => {
    const doctor = await addDoctor('REJECTED', true);
    const { job, mail, teamMail } = makeJob(null);

    expect(await job.run()).toBe(1);
    await flush();
    expect(mail.sent[0]!.to).toBe(doctor.email);
    expect(mail.sent[0]!.subject).toBe('Afyabora : votre compte professionnel n’a pas été validé');
    expect(mail.sent[0]!.replyTo).toBeUndefined();
    expect(mail.sent[0]!.text).not.toContain('répondez');
    expect(teamMail.sent).toHaveLength(0);
  });

  it('comptes sans marque (ex. données de démonstration approuvées directement) : aucun email', async () => {
    await addDoctor('APPROVED', false);
    await addDoctor('REJECTED', false);
    const { job, mail } = makeJob();
    expect(await job.run()).toBe(0);
    expect(mail.sent).toHaveLength(0);
  });

  it('revenu « en attente » : rien à annoncer, la marque est effacée', async () => {
    const doctor = await addDoctor('PENDING', true);
    const { job, mail } = makeJob();
    expect(await job.run()).toBe(0);
    expect(mail.sent).toHaveLength(0);
    expect(await pendingFlag(doctor.id)).toBe(false);
  });

  it('envoi en échec : marque remise, avertissement sans adresse, nouvel essai réussi au passage suivant', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const doctor = await addDoctor('APPROVED', true);
    const { job, mail, teamMail } = makeJob();
    mail.failNext();

    expect(await job.run()).toBe(0);
    expect(await pendingFlag(doctor.id)).toBe(true);
    expect(teamMail.sent).toHaveLength(0); // pas de copie « prévenu » si le médecin ne l'a pas été
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('SmtpError');
    expect(message).not.toContain(doctor.email);

    expect(await job.run()).toBe(1);
    expect(mail.sent.map((m) => m.to)).toEqual([doctor.email]);
    expect(await pendingFlag(doctor.id)).toBe(false);
  });

  it('deux passages en même temps (ou deux serveurs) : un seul email par médecin', async () => {
    const a = await addDoctor('APPROVED', true);
    const b = await addDoctor('REJECTED', true);
    const first = makeJob();
    const second = makeJob();

    // Pire cas, rendu certain : les deux passages LISENT la liste avant que l'un d'eux réserve (barrière).
    // Seule la réservation atomique (true → false) empêche alors l'envoi en double.
    let arrived = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => (release = resolve));
    const withBarrier = new Proxy(prisma, {
      get(target, key) {
        if (key !== 'doctorProfile') return Reflect.get(target, key);
        const profiles = target.doctorProfile;
        return new Proxy(profiles, {
          get(inner, method) {
            if (method !== 'findMany') return Reflect.get(inner, method);
            return async (args: Parameters<typeof profiles.findMany>[0]) => {
              const rows = await profiles.findMany(args);
              if (++arrived === 2) release();
              await bothRead;
              return rows;
            };
          },
        });
      },
    }) as unknown as PrismaService;
    const raced = (job: DoctorDecisionMailJob) => {
      Object.assign(job, { prisma: withBarrier });
      return job.run();
    };

    const [n1, n2] = await Promise.all([raced(first.job), raced(second.job)]);
    expect(n1 + n2).toBe(2);
    const recipients = [...first.mail.sent, ...second.mail.sent].map((m) => m.to).sort();
    expect(recipients).toEqual([a.email, b.email].sort());
  });

  it('au plus 20 emails par passage, le reste au passage suivant', async () => {
    for (let i = 0; i < 22; i++) await addDoctor('APPROVED', true);
    const { job, mail } = makeJob();
    expect(await job.run()).toBe(20);
    expect(await job.run()).toBe(2);
    expect(mail.sent).toHaveLength(22);
  });
});
