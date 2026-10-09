// Contenu des emails du module auth. Nom visible : « Afyabora » (ADR-0007).
// Aucune donnée de santé dans un email ; le lien contient seulement un jeton opaque à usage unique.
import type { OutgoingMail } from '../../common/mail/mail.service';

export interface VerifyEmailMailInput {
  to: string;
  /** Lien complet vers la page de vérification du portail (contient le jeton). */
  link: string;
  validityHours: number;
  /** Compte médecin : on précise que l'accès attend ensuite une approbation. */
  isDoctor: boolean;
}

export function buildVerifyEmailMail({
  to,
  link,
  validityHours,
  isDoctor,
}: VerifyEmailMailInput): OutgoingMail {
  const doctorNote = isDoctor
    ? "Votre compte médecin sera ensuite examiné par l'équipe Afyabora avant de pouvoir accéder aux dossiers partagés."
    : '';
  const lines = [
    'Bonjour,',
    '',
    'Pour activer votre compte Afyabora, confirmez votre adresse email en ouvrant ce lien :',
    link,
    '',
    `Ce lien est valable ${validityHours} heures et ne fonctionne qu'une seule fois.`,
    doctorNote,
    "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.",
    '',
    "L'équipe Afyabora",
  ].filter((line, index, all) => line !== '' || all[index - 1] !== ''); // pas de double ligne vide

  return {
    to,
    subject: 'Afyabora : confirmez votre adresse email',
    text: lines.join('\n'),
    html: [
      '<p>Bonjour,</p>',
      '<p>Pour activer votre compte Afyabora, confirmez votre adresse email :</p>',
      `<p><a href="${link}">Confirmer mon adresse email</a></p>`,
      `<p>Ce lien est valable ${validityHours} heures et ne fonctionne qu'une seule fois.</p>`,
      doctorNote ? `<p>${doctorNote}</p>` : '',
      "<p>Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>",
      "<p>L'équipe Afyabora</p>",
    ].join(''),
  };
}
