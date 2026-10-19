// Emails de la vérification des comptes médecins : alertes à l'ÉQUIPE (boîte TEAM_NOTIFY_EMAIL) et décision
// envoyée au MÉDECIN. Nom visible : « Afyabora » (ADR-0007). Aucune donnée de santé, aucun jeton.
//
// Les nom, numéro d'ordre et établissement sont saisis par le médecin lui-même : dans la version HTML ils sont
// TOUJOURS échappés (sinon un médecin pourrait glisser un faux lien ou du code dans l'email reçu par l'équipe),
// et ils ne vont jamais dans l'objet de l'email.
import type { OutgoingMail } from '../../common/mail/mail.service';

/** Ce que l'équipe a besoin de voir pour vérifier un compte (saisi à l'inscription). */
export interface DoctorSummary {
  email: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  institution: string;
}

export type DoctorDecision = 'APPROVED' | 'REJECTED';

/** Échappe les caractères spéciaux du HTML : le texte s'affiche tel quel, jamais interprété. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fullName(doctor: Pick<DoctorSummary, 'firstName' | 'lastName'>): string {
  return `Dr ${doctor.firstName} ${doctor.lastName}`;
}

/** Fiche du médecin, en texte et en HTML (lignes « libellé : valeur »). */
function doctorCard(doctor: DoctorSummary): { text: string[]; html: string } {
  const rows: [string, string][] = [
    ['Nom', fullName(doctor)],
    ['Email', doctor.email],
    ['Numéro d’ordre', doctor.licenseNumber],
    ['Établissement', doctor.institution],
  ];
  return {
    text: rows.map(([label, value]) => `  ${label} : ${value}`),
    html:
      '<table cellpadding="4" style="border-collapse:collapse">' +
      rows
        .map(
          ([label, value]) =>
            `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`,
        )
        .join('') +
      '</table>',
  };
}

const TEAM_SIGNATURE = 'Message automatique du serveur Afyabora.';

/** Équipe : un médecin vient de s'inscrire (adresse pas encore confirmée : rien à faire pour l'instant). */
export function buildTeamDoctorRegisteredMail(to: string, doctor: DoctorSummary): OutgoingMail {
  const card = doctorCard(doctor);
  return {
    to,
    subject: 'Afyabora : nouvelle inscription médecin',
    text: [
      'Un médecin vient de s’inscrire sur le portail Afyabora.',
      '',
      ...card.text,
      '',
      'Son adresse email n’est pas encore confirmée : rien à faire pour l’instant.',
      'Une seconde alerte arrivera dès que l’adresse sera confirmée.',
      '',
      TEAM_SIGNATURE,
    ].join('\n'),
    html: [
      '<p>Un médecin vient de s’inscrire sur le portail Afyabora.</p>',
      card.html,
      '<p>Son adresse email n’est pas encore confirmée : rien à faire pour l’instant.<br>',
      'Une seconde alerte arrivera dès que l’adresse sera confirmée.</p>',
      `<p>${TEAM_SIGNATURE}</p>`,
    ].join(''),
  };
}

/** Équipe : le médecin a confirmé son adresse, son compte attend la vérification de l'équipe. */
export function buildTeamDoctorToReviewMail(to: string, doctor: DoctorSummary): OutgoingMail {
  const card = doctorCard(doctor);
  const approve = `pnpm admin:doctors approve ${doctor.email}`;
  const reject = `pnpm admin:doctors reject ${doctor.email}`;
  return {
    to,
    subject: 'Afyabora : un médecin attend votre vérification',
    text: [
      'Un médecin a confirmé son adresse email : son compte attend la vérification de l’équipe.',
      '',
      ...card.text,
      '',
      '1. Vérifiez le numéro d’ordre et l’établissement.',
      '2. Décidez depuis le poste d’administration (base hébergée : voir docs/deploy/hebergement.md §6) :',
      `   ${approve}`,
      `   ${reject}`,
      '',
      'Le médecin recevra automatiquement un email avec votre décision.',
      '',
      TEAM_SIGNATURE,
    ].join('\n'),
    html: [
      '<p>Un médecin a confirmé son adresse email : son compte attend la vérification de l’équipe.</p>',
      card.html,
      '<ol>',
      '<li>Vérifiez le numéro d’ordre et l’établissement.</li>',
      '<li>Décidez depuis le poste d’administration (base hébergée : voir docs/deploy/hebergement.md §6) :<br>',
      `<code>${escapeHtml(approve)}</code><br><code>${escapeHtml(reject)}</code></li>`,
      '</ol>',
      '<p>Le médecin recevra automatiquement un email avec votre décision.</p>',
      `<p>${TEAM_SIGNATURE}</p>`,
    ].join(''),
  };
}

export interface DoctorDecisionMailInput {
  to: string;
  decision: DoctorDecision;
  firstName: string;
  lastName: string;
  /** Adresse du portail, sans « / » final. */
  portalUrl: string;
  /** Vrai si une réponse à cet email arrive à l'équipe (Reply-To = boîte de l'équipe). */
  canReply: boolean;
}

/** Médecin : décision de l'équipe (approuvé ou refusé). */
export function buildDoctorDecisionMail(input: DoctorDecisionMailInput): OutgoingMail {
  const { to, decision, portalUrl, canReply } = input;
  const greeting = `Bonjour ${fullName(input)},`;
  const loginLink = `${portalUrl}/login`;
  const reply = canReply ? 'Pour toute question, répondez simplement à cet email.' : '';

  if (decision === 'APPROVED') {
    const lines = [
      'Votre compte professionnel Afyabora a été vérifié et approuvé par notre équipe.',
      'Vous pouvez maintenant consulter les dossiers que vos patients choisissent de partager avec vous, en scannant leur QR code.',
      'Si votre session était déjà ouverte, déconnectez-vous puis reconnectez-vous pour activer cet accès.',
    ];
    return {
      to,
      subject: 'Afyabora : votre compte professionnel est approuvé',
      text: [
        greeting,
        '',
        ...lines,
        '',
        `Se connecter : ${loginLink}`,
        '',
        ...(reply ? [reply, ''] : []),
        "L'équipe Afyabora",
      ].join('\n'),
      html: [
        `<p>${escapeHtml(greeting)}</p>`,
        ...lines.map((line) => `<p>${line}</p>`),
        `<p><a href="${escapeHtml(loginLink)}">Se connecter au portail Afyabora</a></p>`,
        reply ? `<p>${reply}</p>` : '',
        "<p>L'équipe Afyabora</p>",
      ].join(''),
    };
  }

  const lines = [
    'Votre compte professionnel Afyabora n’a pas été validé par notre équipe : il ne permet pas d’accéder aux dossiers des patients.',
    'Cela arrive notamment quand le numéro d’ordre ou l’établissement n’a pas pu être vérifié.',
  ];
  return {
    to,
    subject: 'Afyabora : votre compte professionnel n’a pas été validé',
    text: [greeting, '', ...lines, '', ...(reply ? [reply, ''] : []), "L'équipe Afyabora"].join(
      '\n',
    ),
    html: [
      `<p>${escapeHtml(greeting)}</p>`,
      ...lines.map((line) => `<p>${line}</p>`),
      reply ? `<p>${reply}</p>` : '',
      "<p>L'équipe Afyabora</p>",
    ].join(''),
  };
}

/** Équipe : copie de la décision, pour que chaque membre sache que le médecin a été prévenu. */
export function buildTeamDecisionSentMail(
  to: string,
  doctor: DoctorSummary,
  decision: DoctorDecision,
): OutgoingMail {
  const card = doctorCard(doctor);
  const label = decision === 'APPROVED' ? 'APPROUVÉ' : 'REFUSÉ';
  return {
    to,
    subject: `Afyabora : médecin prévenu (compte ${label.toLowerCase()})`,
    text: [
      `Le médecin a reçu l’email de décision : compte ${label}.`,
      '',
      ...card.text,
      '',
      TEAM_SIGNATURE,
    ].join('\n'),
    html: [
      `<p>Le médecin a reçu l’email de décision : compte <strong>${label}</strong>.</p>`,
      card.html,
      `<p>${TEAM_SIGNATURE}</p>`,
    ].join(''),
  };
}
