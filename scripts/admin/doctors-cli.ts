// Outil en ligne de commande : administration des comptes médecins (L1-12). Remplace une interface
// d'administration dans le MVP. Usage : `pnpm admin:doctors help` (voir USAGE dans doctors.ts).
//
// Déroulé d'une approbation / d'un refus : la fiche du médecin est affichée, ce qui va changer est
// expliqué, puis on demande confirmation (sauf --yes). Codes de sortie : 0 = fait ou rien à faire,
// 1 = refusé ou erreur, 2 = commande mal écrite.
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { prismaDoctorStore, type DoctorStore } from './doctor-store.ts';
import { USAGE, formatDoctor, formatTable, parseArgs, planAction, statusLabel } from './doctors.ts';

export interface CliDeps {
  store: DoctorStore;
  /** Pose une question (oui / non) ; `null` si personne ne peut répondre (pas de terminal). */
  confirm: ((question: string) => Promise<boolean>) | null;
  print: (text: string) => void;
  now: () => Date;
}

/** Exécute une commande ; renvoie le code de sortie. */
export async function run(argv: readonly string[], deps: CliDeps): Promise<number> {
  const { store, confirm, print, now } = deps;
  const command = parseArgs(argv);

  if ('error' in command) {
    print(`✖ ${command.error}\n\n${USAGE}`);
    return 2;
  }
  if (command.kind === 'help') {
    print(USAGE);
    return 0;
  }

  if (command.kind === 'list') {
    const doctors = await store.list(command.status);
    // « compte » au singulier pour 0 ou 1, « comptes » au-delà.
    const noun = doctors.length > 1 ? 'comptes' : 'compte';
    const what =
      command.status === 'ALL'
        ? `${noun} ${doctors.length > 1 ? 'médecins' : 'médecin'}`
        : `${noun} ${statusLabel(command.status, doctors.length > 1)}`;
    if (!doctors.length) {
      print(`Aucun ${what}.`);
      return 0;
    }
    print(`${doctors.length} ${what} :\n\n${formatTable(doctors)}`);
    if (command.status === 'PENDING') {
      print('\nPour décider : pnpm admin:doctors approve <email>   ou   reject <email>');
    }
    return 0;
  }

  const doctor = await store.find(command.email);
  if (!doctor) {
    print(`✖ Aucun compte médecin pour ${command.email}.`);
    return 1;
  }

  if (command.kind === 'show') {
    print(formatDoctor(doctor));
    return 0;
  }

  const plan = planAction(doctor, command.kind);
  print(formatDoctor(doctor));
  if (plan.kind === 'noop') {
    print(`\n${plan.message}`);
    return 0;
  }
  if (plan.kind === 'refused') {
    print(`\n✖ ${plan.message}`);
    return 1;
  }

  print(`\n${plan.summary}`);
  if (!command.yes) {
    if (!confirm) {
      print('✖ Pas de terminal pour confirmer : relancez avec --yes si vous êtes sûr.');
      return 1;
    }
    const verb = command.kind === 'approve' ? 'Approuver' : 'Refuser';
    if (!(await confirm(`${verb} ce compte ? (o/N) `))) {
      print('Annulé : rien n’a été modifié.');
      return 0;
    }
  }

  if (command.kind === 'approve') {
    await store.approve(doctor.userId, now());
    print(`✔ ${doctor.email} : APPROUVÉ.`);
    print(
      'Prévenez le médecin : il doit se déconnecter puis se reconnecter au portail pour accéder aux dossiers.',
    );
  } else {
    const effects = await store.reject(doctor.userId, now());
    print(`✔ ${doctor.email} : REFUSÉ.`);
    print(
      `  Sessions de connexion fermées : ${effects.revokedSessions} · partages en cours arrêtés : ${effects.endedShares}`,
    );
  }
  return 0;
}

/** Question oui / non dans le terminal ; seule une réponse « o » / « oui » vaut oui. */
async function askInTerminal(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === 'o' || answer === 'oui' || answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

/** Point d'entrée quand le fichier est lancé directement (pas quand il est importé par un test). */
export async function main(argv: readonly string[]): Promise<void> {
  const prisma = new PrismaClient();
  try {
    process.exitCode = await run(argv, {
      store: prismaDoctorStore(prisma),
      confirm: process.stdin.isTTY ? askInTerminal : null,
      print: (text) => console.log(text),
      now: () => new Date(),
    });
  } catch (error) {
    // Message court, sans pile technique ni donnée sensible (ex. base injoignable).
    console.error(`✖ ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main(process.argv.slice(2));
}
