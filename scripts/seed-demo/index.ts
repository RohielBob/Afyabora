// Données de démonstration : 3 patients FICTIFS (qualité Bonne / Partielle / Insuffisante) + 1 médecin approuvé.
// Usage : pnpm db:seed   (nécessite la base migrée et DEMO_PASSWORD dans apps/api/.env)
// ⚠ À valider avec la base réelle (ticket L7-07). N'utilise AUCUNE donnée réelle.
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { DEMO_PROFILES, generateSeries } from './generators/glucose-series.ts';

const prisma = new PrismaClient();
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 12) {
  throw new Error('Définissez DEMO_PASSWORD (12 caractères minimum) dans apps/api/.env');
}

const PATIENTS = [
  {
    key: 'jean',
    email: 'jean@demo.glyka.local',
    firstName: 'Jean',
    lastName: 'Demo',
    type: 'TYPE_2',
  },
  {
    key: 'marie',
    email: 'marie@demo.glyka.local',
    firstName: 'Marie',
    lastName: 'Demo',
    type: 'TYPE_1',
  },
  {
    key: 'paul',
    email: 'paul@demo.glyka.local',
    firstName: 'Paul',
    lastName: 'Demo',
    type: 'TYPE_2',
  },
] as const;

async function main() {
  const passwordHash = await argon2.hash(password as string, { type: argon2.argon2id });
  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  endDate.setUTCHours(0, 0, 0, 0);

  for (const p of PATIENTS) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        email: p.email,
        passwordHash,
        role: 'PATIENT',
        emailVerifiedAt: new Date(),
        consentAt: new Date(),
        patientProfile: {
          create: {
            firstName: p.firstName,
            lastName: p.lastName,
            birthDate: new Date('1980-05-14'),
            sex: 'M',
            diabetesType: p.type,
            diagnosisYear: 2016,
          },
        },
      },
    });

    await prisma.measurement.deleteMany({ where: { patientId: user.id } });
    const series = generateSeries({ ...DEMO_PROFILES[p.key], endDate });
    const now = new Date();
    await prisma.measurement.createMany({
      data: series.map((m) => ({
        id: randomUUID(),
        patientId: user.id,
        valueMgDl: m.mgDl,
        originalValue: m.mgDl / 100,
        originalUnit: 'G_L' as const,
        measuredAt: m.measuredAt,
        context: m.context,
        source: 'MANUAL' as const,
        clientUpdatedAt: now,
      })),
    });
    console.log(`${p.firstName} : ${series.length} mesures`);
  }

  await prisma.user.upsert({
    where: { email: 'dr.demo@glyka.local' },
    update: {},
    create: {
      email: 'dr.demo@glyka.local',
      passwordHash,
      role: 'DOCTOR',
      emailVerifiedAt: new Date(),
      consentAt: new Date(),
      doctorProfile: {
        create: {
          firstName: 'Demo',
          lastName: 'Médecin',
          licenseNumber: 'DEMO-0001',
          institution: 'Clinique de démonstration',
          verificationStatus: 'APPROVED',
          verifiedAt: new Date(),
        },
      },
    },
  });
  console.log('Médecin de démonstration : dr.demo@glyka.local (approuvé)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
