// Textes du portail (français). Aucun texte n'est écrit dans les pages : tout est ici, pour relire,
// corriger et traduire au même endroit. Pas de bibliothèque d'i18n (pas de nouvelle dépendance) :
// un objet typé suffit ; `fill` remplace les {{variables}}.
export const fr = {
  app: {
    name: 'Afyabora',
    space: 'Espace professionnel',
    tagline: 'Le suivi glycémique de vos patients, partagé avec leur accord.',
  },
  common: {
    back: 'Retour',
    show: 'Afficher',
    hide: 'Masquer',
    loading: 'Chargement…',
    required: 'obligatoire',
    optional: 'facultatif',
  },
  brand: {
    title: 'Les données que votre patient choisit de partager, le temps de la consultation.',
    points: [
      'Accès par QR code, à usage unique, ouvert par le patient',
      'Lecture seule, limitée dans le temps et journalisée',
      'Aucune donnée conservée sur ce poste',
    ],
    disclaimer:
      'Afyabora est un outil d’aide au suivi. Les chiffres et observations ne constituent pas un diagnostic.',
  },
  fields: {
    email: 'Adresse email professionnelle',
    emailPlaceholder: 'dr.nom@etablissement.org',
    password: 'Mot de passe',
    newPassword: 'Nouveau mot de passe',
    passwordHint: 'Une phrase facile à retenir est plus sûre qu’un mot compliqué.',
    firstName: 'Prénom',
    lastName: 'Nom',
    licenseNumber: 'Numéro d’ordre',
    licenseHint: 'Votre numéro d’inscription à l’Ordre, vérifié avant l’ouverture du compte.',
    institution: 'Établissement',
    institutionPlaceholder: 'Hôpital, centre de santé, cabinet…',
  },
  password: {
    rule: 'Au moins 12 caractères',
  },
  validation: {
    email: 'Saisissez une adresse email valide.',
    passwordLength: 'Le mot de passe doit contenir au moins 12 caractères.',
    passwordRequired: 'Saisissez votre mot de passe.',
    firstName: 'Saisissez votre prénom.',
    lastName: 'Saisissez votre nom.',
    licenseNumber: 'Saisissez votre numéro d’ordre (3 caractères au moins).',
    institution: 'Saisissez votre établissement.',
    attest: 'Cette confirmation est nécessaire pour créer un compte professionnel.',
    terms: 'Votre accord est nécessaire pour créer un compte.',
    link: 'Ce lien n’est pas reconnu. Copiez le lien complet de l’email.',
  },
  errors: {
    network: 'Le serveur ne répond pas. Vérifiez votre connexion puis réessayez.',
    server: 'Le service rencontre un problème. Réessayez dans quelques instants.',
    tooManyRequests: 'Trop de tentatives. Patientez une minute avant de réessayer.',
    invalidData: 'Certaines informations ne sont pas valides. Vérifiez le formulaire.',
    unexpected: 'Une erreur inattendue est survenue. Réessayez.',
    invalidCredentials: 'Adresse email ou mot de passe incorrect.',
    emailNotVerified:
      'Votre adresse email n’est pas encore vérifiée. Ouvrez le lien reçu par email, ou recommencez l’inscription pour en recevoir un nouveau.',
    locked: 'Trop d’essais : compte bloqué temporairement. Réessayez dans {{minutes}} min.',
    verifyLinkInvalid:
      'Ce lien n’est plus valable (déjà utilisé ou expiré). Recommencez l’inscription pour en recevoir un nouveau.',
    resetLinkInvalid:
      'Ce lien n’est plus valable (déjà utilisé, expiré ou remplacé). Demandez un nouveau lien.',
    notDoctor:
      'Ce portail est réservé aux professionnels de santé. Patient ? Utilisez l’application Afyabora sur votre téléphone.',
    sessionExpired: 'Votre session a expiré. Reconnectez-vous.',
    idle: 'Vous avez été déconnecté après {{minutes}} minutes d’inactivité, pour protéger les données.',
  },
  login: {
    overline: 'Connexion',
    title: 'Bon retour',
    subtitle: 'Connectez-vous pour consulter les dossiers que vos patients partagent avec vous.',
    submit: 'Se connecter',
    forgot: 'Mot de passe oublié ?',
    noAccount: 'Pas encore de compte ?',
    register: 'Créer un compte professionnel',
    sharedComputer:
      'Poste partagé ? Déconnectez-vous après la consultation. La session se ferme seule après {{minutes}} minutes d’inactivité.',
  },
  register: {
    overline: 'Inscription',
    title: 'Créer un compte professionnel',
    subtitle:
      'Votre compte sera vérifié par notre équipe avant de pouvoir consulter un dossier patient.',
    identity: 'Vous',
    practice: 'Votre exercice',
    access: 'Vos accès',
    attest:
      'Je certifie être un professionnel de santé habilité et que les informations ci-dessus sont exactes.',
    terms:
      'Je m’engage à respecter le secret médical : je consulte uniquement les données qu’un patient partage avec moi, et je sais que chaque accès est enregistré et visible par le patient.',
    submit: 'Créer mon compte',
    haveAccount: 'Déjà un compte ?',
    signIn: 'Se connecter',
    sentTitle: 'Vérifiez votre boîte mail',
    sentText:
      'Si cette adresse peut être utilisée, un lien de confirmation vient d’être envoyé à {{email}}. Il est valable 24 heures.',
    sentNext:
      'Ensuite, notre équipe vérifie votre numéro d’ordre. Vous pourrez vous connecter dès la confirmation de votre adresse, et consulter des dossiers une fois le compte approuvé.',
    sentSpam: 'Rien reçu ? Regardez dans les courriers indésirables.',
    steps: ['Adresse confirmée', 'Compte vérifié par l’équipe', 'Premier scan de QR'],
  },
  verify: {
    overline: 'Vérification',
    working: 'Vérification de votre adresse…',
    okTitle: 'Adresse vérifiée',
    okText: 'Votre adresse email est confirmée.',
    okDoctor: 'Professionnel de santé : vous pouvez maintenant vous connecter au portail.',
    okPatient:
      'Patient : revenez dans l’application Afyabora sur votre téléphone pour vous connecter.',
    failTitle: 'Lien non valable',
    missing: 'Aucun lien de vérification. Ouvrez le lien complet reçu par email.',
    signIn: 'Se connecter',
    register: 'Recommencer l’inscription',
  },
  forgot: {
    overline: 'Mot de passe oublié',
    title: 'Réinitialiser le mot de passe',
    subtitle:
      'Indiquez votre adresse : si un compte existe, vous recevrez un lien valable 1 heure.',
    submit: 'Recevoir le lien',
    sentTitle: 'Demande envoyée',
    sentText:
      'Si un compte existe pour {{email}}, un email vient de partir avec un lien valable 1 heure.',
    backToLogin: 'Retour à la connexion',
  },
  reset: {
    overline: 'Nouveau mot de passe',
    title: 'Choisir un nouveau mot de passe',
    subtitle: 'Toutes vos sessions ouvertes seront fermées par sécurité.',
    submit: 'Enregistrer le mot de passe',
    okTitle: 'Mot de passe modifié',
    okDoctor: 'Professionnel de santé : connectez-vous avec votre nouveau mot de passe.',
    okPatient: 'Patient : reconnectez-vous dans l’application Afyabora.',
    missing: 'Aucun lien de réinitialisation. Ouvrez le lien complet reçu par email.',
    newLink: 'Demander un nouveau lien',
  },
  pending: {
    overline: 'Compte en attente',
    title: 'Votre compte est en cours de vérification',
    text: 'Pour protéger les patients, chaque compte professionnel est vérifié par notre équipe (numéro d’ordre, établissement) avant de donner accès à un dossier.',
    whileTitle: 'En attendant',
    while: [
      'Aucun dossier patient n’est accessible depuis ce compte.',
      'Vous n’avez rien à faire : la vérification est faite par notre équipe.',
      'Une fois le compte approuvé, déconnectez-vous puis reconnectez-vous pour l’activer.',
    ],
    stepDone: 'Fait',
    stepNow: 'En cours',
    stepNext: 'Ensuite',
    steps: ['Adresse email confirmée', 'Vérification par l’équipe', 'Accès aux dossiers partagés'],
    recheck: 'J’ai été approuvé : me reconnecter',
    rejectedOverline: 'Compte non validé',
    rejectedTitle: 'Votre compte n’a pas pu être validé',
    rejectedText:
      'Les informations fournies n’ont pas permis de confirmer votre exercice. Aucun dossier patient n’est accessible depuis ce compte. Contactez l’équipe Afyabora si vous pensez qu’il s’agit d’une erreur.',
  },
  shell: {
    nav: { patients: 'Mes patients', scan: 'Scanner un QR' },
    signedInAs: 'Connecté : {{email}}',
    signOut: 'Se déconnecter',
    signingOut: 'Déconnexion…',
    menu: 'Compte',
  },
  notFound: {
    title: 'Page introuvable',
    text: 'Cette adresse ne correspond à aucune page du portail.',
    home: 'Retour à l’accueil',
  },
} as const;

/** Remplace les {{variables}} d'un texte. */
export function fill(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}
