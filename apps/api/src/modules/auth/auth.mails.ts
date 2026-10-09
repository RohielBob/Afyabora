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

export interface ResetPasswordMailInput {
  to: string;
  /** Lien complet vers la page « nouveau mot de passe » du portail (contient le jeton). */
  link: string;
  validityMinutes: number;
}

/** Email « mot de passe oublié » (L1-03). Ne contient jamais l'ancien ni le nouveau mot de passe. */
export function buildResetPasswordMail({
  to,
  link,
  validityMinutes,
}: ResetPasswordMailInput): OutgoingMail {
  return {
    to,
    subject: 'Afyabora : réinitialisation de votre mot de passe',
    text: [
      'Bonjour,',
      '',
      'Vous avez demandé à changer le mot de passe de votre compte Afyabora. Ouvrez ce lien pour en choisir un nouveau :',
      link,
      '',
      `Ce lien est valable ${validityMinutes} minutes et ne fonctionne qu'une seule fois.`,
      'Après le changement, toutes vos sessions ouvertes seront fermées : il faudra vous reconnecter.',
      "Si vous n'avez rien demandé, ignorez cet email : votre mot de passe actuel reste valable.",
      '',
      "L'équipe Afyabora",
    ].join('\n'),
    html: [
      '<p>Bonjour,</p>',
      '<p>Vous avez demandé à changer le mot de passe de votre compte Afyabora.</p>',
      `<p><a href="${link}">Choisir un nouveau mot de passe</a></p>`,
      `<p>Ce lien est valable ${validityMinutes} minutes et ne fonctionne qu'une seule fois.</p>`,
      '<p>Après le changement, toutes vos sessions ouvertes seront fermées : il faudra vous reconnecter.</p>',
      "<p>Si vous n'avez rien demandé, ignorez cet email : votre mot de passe actuel reste valable.</p>",
      "<p>L'équipe Afyabora</p>",
    ].join(''),
  };
}
