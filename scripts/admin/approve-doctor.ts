// Approuve (ou rejette) un compte médecin. Remplace une interface d'administration dans le MVP.
// Usage : pnpm admin:approve-doctor -- <email> [--reject]
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const [email, flag] = process.argv.slice(2).filter((a) => a !== '--');

async function main() {
  if (!email) throw new Error('Usage : pnpm admin:approve-doctor -- <email> [--reject]');
  const user = await prisma.user.findUnique({ where: { email }, include: { doctorProfile: true } });
  if (!user?.doctorProfile) throw new Error(`Aucun compte médecin pour ${email}`);
  const approve = flag !== '--reject';
  await prisma.doctorProfile.update({
    where: { userId: user.id },
    data: { verificationStatus: approve ? 'APPROVED' : 'REJECTED', verifiedAt: approve ? new Date() : null },
  });
  console.log(`${email} : ${approve ? 'APPROUVÉ' : 'REJETÉ'}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
