// Administration des comptes médecins (L1-12) : la LOGIQUE, sans base de données ni terminal.
// Lecture des arguments, règles d'approbation / de refus, mise en forme de l'affichage.
// Testée dans doctors.test.ts ; la base est dans doctor-store.ts, le terminal dans doctors-cli.ts.

export const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type DoctorStatus = (typeof STATUSES)[number];

/** Ce que l'outil sait d'un compte médecin (lu en base). */
export interface DoctorAccount {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  institution: string;
  status: DoctorStatus;
  emailVerifiedAt: Date | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

// ---------- Arguments ----------

export type Command =
  | { kind: 'list'; status: DoctorStatus | 'ALL' }
  | { kind: 'show'; email: string }
  | { kind: 'approve' | 'reject'; email: string; yes: boolean }
  | { kind: 'help' };

export const USAGE = [
  'Comptes médecins — usage :',
  '  pnpm admin:doctors list [--all | --status=PENDING|APPROVED|REJECTED]   (défaut : en attente)',
  '  pnpm admin:doctors show <email>',
  '  pnpm admin:doctors approve <email> [--yes]',
  '  pnpm admin:doctors reject <email> [--yes]',
  '',
  '  --yes : ne pas demander de confirmation (obligatoire hors terminal interactif).',
].join('\n');

/** Lit les arguments ; renvoie un message d'erreur (en français) si la commande est mal écrite. */
export function parseArgs(argv: readonly string[]): Command | { error: string } {
  const args = argv.filter((a) => a !== '--'); // « pnpm … -- x » transmet parfois « -- »
  const flags = args.filter((a) => a.startsWith('--'));
  const words = args.filter((a) => !a.startsWith('--'));
  const [verb = 'list', target, ...extra] = words;

  if (flags.includes('--help') || verb === 'help') return { kind: 'help' };
  const known = ['--yes', '--all'];
  const unknown = flags.find((f) => !known.includes(f) && !f.startsWith('--status='));
  if (unknown) return { error: `Option inconnue : ${unknown}` };
  if (extra.length) return { error: `Argument en trop : ${extra.join(' ')}` };

  if (verb === 'list') {
    if (target) return { error: 'La commande « list » ne prend pas d’adresse.' };
    const statusFlag = flags.find((f) => f.startsWith('--status='));
    if (flags.includes('--all')) return { kind: 'list', status: 'ALL' };
    if (!statusFlag) return { kind: 'list', status: 'PENDING' };
    const value = statusFlag.slice('--status='.length).toUpperCase();
    if (!(STATUSES as readonly string[]).includes(value)) {
      return { error: `Statut inconnu : ${value} (attendu : ${STATUSES.join(', ')})` };
    }
    return { kind: 'list', status: value as DoctorStatus };
  }

  if (verb === 'show' || verb === 'approve' || verb === 'reject') {
    const email = target?.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return { error: `Indiquez l’adresse email du médecin : pnpm admin:doctors ${verb} <email>` };
    }
    if (verb === 'show') return { kind: 'show', email };
    return { kind: verb, email, yes: flags.includes('--yes') };
  }

  return { error: `Commande inconnue : ${verb}` };
}

// ---------- Règles ----------

export type Plan =
  | { kind: 'change'; to: DoctorStatus; summary: string }
  | { kind: 'noop'; message: string }
  | { kind: 'refused'; message: string };

/**
 * Que faire pour approuver ou refuser ce compte ?
 *  - approuver exige une adresse email CONFIRMÉE (sinon on ne sait pas qui lit cette boîte) ;
 *  - approuver un compte refusé est possible (réexamen) ; refuser un compte approuvé aussi (suspension) ;
 *  - refaire la même action ne change rien (pas d'erreur).
 */
export function planAction(doctor: DoctorAccount, action: 'approve' | 'reject'): Plan {
  if (action === 'approve') {
    if (doctor.status === 'APPROVED') {
      return { kind: 'noop', message: `${doctor.email} est déjà approuvé : rien à faire.` };
    }
    if (!doctor.emailVerifiedAt) {
      return {
        kind: 'refused',
        message:
          `${doctor.email} n’a pas encore confirmé son adresse email : approbation impossible.\n` +
          'Le médecin doit d’abord ouvrir le lien reçu par email (ou se réinscrire pour en recevoir un nouveau).',
      };
    }
    return {
      kind: 'change',
      to: 'APPROVED',
      summary:
        doctor.status === 'REJECTED'
          ? 'Le compte, refusé auparavant, sera APPROUVÉ (réexamen).'
          : 'Le compte sera APPROUVÉ : le médecin pourra scanner les QR de ses patients.',
    };
  }

  if (doctor.status === 'REJECTED') {
    return { kind: 'noop', message: `${doctor.email} est déjà refusé : rien à faire.` };
  }
  return {
    kind: 'change',
    to: 'REJECTED',
    summary:
      doctor.status === 'APPROVED'
        ? 'Le compte, approuvé jusqu’ici, sera REFUSÉ (suspension) : ses sessions ouvertes et ses accès en cours aux dossiers seront fermés tout de suite.'
        : 'Le compte sera REFUSÉ : aucun dossier patient ne sera accessible.',
  };
}

// ---------- Affichage ----------

const LABEL: Record<DoctorStatus, string> = {
  PENDING: 'en attente',
  APPROVED: 'approuvé',
  REJECTED: 'refusé',
};

/** Date lisible, toujours en UTC (pas d'ambiguïté entre les postes de l'équipe). */
export function formatDate(date: Date | null): string {
  if (!date) return '—';
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** Libellé d'un statut ; au pluriel, « approuvés » / « refusés » (« en attente » ne change pas). */
export function statusLabel(status: DoctorStatus, plural = false): string {
  return plural && status !== 'PENDING' ? `${LABEL[status]}s` : LABEL[status];
}

/** Fiche détaillée d'un compte. */
export function formatDoctor(d: DoctorAccount): string {
  return [
    `  Médecin          : Dr ${d.firstName} ${d.lastName}`,
    `  Email            : ${d.email} ${d.emailVerifiedAt ? '(confirmé)' : '(NON confirmé)'}`,
    `  Numéro d’ordre   : ${d.licenseNumber}`,
    `  Établissement    : ${d.institution}`,
    `  Statut           : ${LABEL[d.status]}`,
    `  Inscrit le       : ${formatDate(d.createdAt)}`,
    `  Statut changé le : ${formatDate(d.verifiedAt)}`,
  ].join('\n');
}

/** Tableau des comptes (colonnes alignées, coupées si trop longues). */
export function formatTable(doctors: readonly DoctorAccount[]): string {
  const cut = (text: string, max: number) =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text;
  const headers = [
    'Email',
    'Nom',
    'N° d’ordre',
    'Établissement',
    'Email ok',
    'Statut',
    'Inscrit le',
  ];
  const rows = doctors.map((d) => [
    cut(d.email, 34),
    cut(`${d.firstName} ${d.lastName}`, 24),
    cut(d.licenseNumber, 16),
    cut(d.institution, 24),
    d.emailVerifiedAt ? 'oui' : 'non',
    LABEL[d.status],
    formatDate(d.createdAt).slice(0, 10),
  ]);
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => c.padEnd(widths[i]!))
      .join('  ')
      .trimEnd();
  return [line(headers), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

// ---------- Messages ----------

/** Affiché après une approbation ou un refus : c'est l'API qui prévient le médecin, pas cet outil. */
export const DECISION_MAIL_NOTE = [
  'Le médecin recevra un email avec cette décision, envoyé par l’API dans la minute qui suit',
  '(et une copie arrive dans la boîte de l’équipe, si TEAM_NOTIFY_EMAIL est configurée).',
  'API hébergée en veille (offre gratuite) : l’email part à son réveil ; ouvrez <adresse-de-l-api>/health pour la réveiller.',
  'Approuvé : le médecin doit se déconnecter puis se reconnecter au portail pour accéder aux dossiers.',
].join('\n');

/**
 * Résumé d'une erreur en UNE ligne utile. Les erreurs Prisma commencent par une ligne vide puis
 * « Invalid `prisma.….findMany()` invocation: » : la vraie cause vient après (avant ce correctif, seule la
 * première ligne, vide, était affichée : « ✖ » sans explication). Prisma n'écrit jamais le mot de passe.
 */
export function errorSummary(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause =
    error.message
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '' && !/^Invalid `.*` invocation/.test(line))
      ?.replace(/^error:\s*/i, '') ?? error.name;
  if (/URL must start with the protocol/i.test(cause)) {
    return `${cause}\n  ⇒ DATABASE_URL est vide ou mal collée : elle doit commencer par postgresql://`;
  }
  return cause;
}
