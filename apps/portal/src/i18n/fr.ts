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
  // L4-09 : provenance d'une mesure (même règle et mêmes mots que l'application du patient).
  provenance: {
    MANUAL: 'Saisie',
    IMPORT: 'Import',
    DEVICE: 'Appareil',
    importBatch: 'Import · lot {{batch}}',
    a11y: 'Provenance : {{label}}',
  },
  // L5-10 : scanner le QR d'un patient (caméra, photo, code de secours).
  scan: {
    overline: 'Partage patient',
    title: 'Scanner le QR du patient',
    intro:
      'Le patient ouvre Afyabora, puis Partager › Générer le QR. Présentez son écran à la caméra : l’accès s’ouvre aussitôt, pour la durée qu’il a choisie.',
    claiming: 'Ouverture de l’accès…',
    claimingText: 'Le QR est vérifié par le serveur.',
    tips: [
      'Le QR change toutes les minutes et ne sert qu’une fois.',
      'Tenez l’écran du téléphone à 20–30 cm de la caméra, sans reflet.',
      'Vous ne verrez que les données que le patient a choisi de partager.',
    ],
    camera: {
      title: 'Caméra',
      idle: 'La caméra s’allume seulement quand vous le demandez, et s’éteint dès que le QR est lu.',
      start: 'Activer la caméra',
      stop: 'Arrêter la caméra',
      viewA11y: 'Image de la caméra',
      problem: {
        denied: {
          title: 'Accès à la caméra refusé',
          text: 'Autorisez la caméra pour ce site dans votre navigateur (icône à gauche de l’adresse), ou utilisez une photo ou le code de secours.',
        },
        none: {
          title: 'Aucune caméra détectée',
          text: 'Branchez une webcam, ou utilisez une photo du QR ou le code de secours.',
        },
        busy: {
          title: 'Caméra déjà utilisée',
          text: 'Fermez l’autre application qui utilise la caméra (visioconférence…), puis réessayez.',
        },
        insecure: {
          title: 'Caméra indisponible sur cette adresse',
          text: 'Le navigateur ne donne la caméra qu’aux sites sécurisés (https). Utilisez une photo du QR ou le code de secours.',
        },
        other: {
          title: 'La caméra n’a pas pu démarrer',
          text: 'Réessayez, ou utilisez une photo du QR ou le code de secours.',
        },
      },
    },
    backup: {
      title: 'Pas de caméra ?',
      intro: 'Deux solutions de secours, aussi sûres que le scan.',
    },
    photo: {
      title: 'Photo du QR',
      text: 'Prenez l’écran du patient en photo (par exemple avec votre téléphone), puis choisissez l’image. Elle est lue sur ce poste, jamais envoyée.',
      action: 'Choisir une photo du QR',
    },
    code: {
      label: 'Code de secours',
      hint: 'Le code affiché sous le QR, à coller ou recopier (les espaces sont ignorés).',
      submit: 'Ouvrir l’accès',
    },
    problem: {
      notAfyabora: {
        title: 'Ce n’est pas un QR de partage Afyabora',
        text: 'Vérifiez que le patient affiche bien l’écran « Montrez ce QR à votre médecin » dans l’application.',
      },
      invalid: {
        title: 'QR invalide ou expiré',
        text: 'Demandez au patient d’afficher un nouveau QR, puis scannez-le de nouveau.',
      },
      notApproved: {
        title: 'Compte pas encore approuvé',
        text: 'Votre compte doit être validé avant de pouvoir ouvrir un dossier patient.',
      },
      blocked: {
        title: 'Trop de QR invalides',
        text: 'Pour protéger les patients, les scans sont bloqués quelques instants. Réessayez dans {{seconds}} s.',
      },
      network: {
        title: 'Le serveur ne répond pas',
        text: 'Vérifiez votre connexion, puis scannez de nouveau.',
      },
      server: {
        title: 'Le service rencontre un problème',
        text: 'Réessayez dans quelques instants.',
      },
    },
  },
  // L5-11 : mes patients partagés.
  patients: {
    overline: 'Partage patient',
    title: 'Mes patients partagés',
    intro: 'Les patients qui vous ont ouvert leur dossier en vous montrant leur QR.',
    activeNone: 'Aucun accès en cours. Scannez le QR d’un patient pour ouvrir son dossier.',
    active: '{{count}} accès en cours.',
    scan: 'Scanner un QR',
    open: 'Ouvrir le dossier',
    listA11y: 'Patients partagés',
    until: 'jusqu’à {{when}}',
    endedAt: 'terminé à {{when}}',
    dateTime: '{{date}} à {{time}}',
    shared: 'Partagé :',
    noMeasurement: 'Aucune mesure enregistrée',
    lastToday: 'Dernière mesure aujourd’hui à {{time}}',
    lastOn: 'Dernière mesure le {{date}} à {{time}}',
    qualityA11y: 'Qualité des données : {{label}}, {{score}} sur 100',
    retry: 'Réessayer',
    note: 'Lecture seule. L’accès se ferme à l’heure choisie par le patient, ou plus tôt s’il y met fin ; chaque consultation du dossier est enregistrée dans son journal.',
    status: {
      ACTIVE: 'Accès en cours',
      EXPIRED: 'Accès expiré',
      REVOKED: 'Arrêté par le patient',
      PENDING: 'En attente',
    },
    quality: {
      GOOD: 'Données de bonne qualité',
      PARTIAL: 'Données partielles',
      INSUFFICIENT: 'Données insuffisantes',
    },
    diabetes: {
      TYPE_1: 'Diabète de type 1',
      TYPE_2: 'Diabète de type 2',
      GESTATIONAL: 'Diabète gestationnel',
      OTHER: 'Autre diabète',
    },
    categories: {
      GLUCOSE_HISTORY: 'Glycémies',
      TREATMENTS: 'Traitements',
      MEALS: 'Repas',
      ACTIVITY: 'Activité',
      AI_SUMMARY: 'Résumé des analyses',
      PERSONAL_NOTES: 'Notes personnelles',
      REPORT_DOWNLOAD: 'Rapport PDF',
    },
    empty: {
      title: 'Aucun patient partagé pour l’instant',
      text: 'Quand un patient vous montre son QR et que vous le scannez, il apparaît ici, avec ce qu’il a choisi de partager.',
    },
    problem: {
      network: {
        title: 'Le serveur ne répond pas',
        text: 'Vérifiez votre connexion. La liste se met à jour toute seule dès le retour du réseau.',
      },
      server: {
        title: 'La liste n’a pas pu être chargée',
        text: 'Réessayez dans quelques instants.',
      },
    },
  },
  record: {
    back: 'Mes patients',
    overline: 'Dossier partagé',
    diagnosed: 'diagnostiqué en {{year}}',
    disclaimer:
      'Afyabora est un outil d’aide au suivi : il ne pose pas de diagnostic et ne remplace pas votre avis médical. Les données sont saisies par le patient.',
    readOnly: 'Lecture seule · chaque consultation est enregistrée dans le journal du patient.',
    tabsA11y: 'Parties du dossier',
    tabs: {
      overview: 'Vue d’ensemble',
      glucose: 'Glycémie',
      timeline: 'Chronologie',
      treatments: 'Traitements',
      meals: 'Nutrition',
      activity: 'Activité',
      summary: 'Résumé des analyses',
      report: 'Rapport PDF',
    },
    period: 'Période',
    periodDays: '{{days}} j',
    periodA11y: '{{days}} derniers jours',
    unit: 'Unité',
    sinceDays: 'sur les {{days}} derniers jours',
    overview: {
      quality: 'Qualité des données',
      qualityHint:
        '30 derniers jours : régularité, nombre de mesures par jour et mesures récentes.',
      coverage: 'Jours avec mesures',
      density: 'Mesures par jour',
      freshness: 'Mesures récentes',
      daysWithData: '{{days}} jours avec au moins une mesure sur {{total}}',
      stats: 'Chiffres des 30 derniers jours',
      count: 'Mesures',
      mean: 'Moyenne',
      sd: 'Écart-type',
      cv: 'Variabilité (CV)',
      inRange: 'Dans la plage',
      above: 'Au-dessus',
      below: 'En dessous',
      distributionA11y:
        'Répartition : {{inRange}} % dans la plage, {{above}} % au-dessus, {{below}} % en dessous',
      notEnough: 'Moins de 10 mesures sur la période : pas de chiffres fiables à afficher.',
      notShared:
        'Le patient n’a partagé ni ses glycémies ni le résumé des analyses : aucun chiffre n’est affiché.',
      thresholds: 'Seuils du patient',
      thresholdsHint:
        'Choisis avec le patient dans son application ; ils servent à classer chaque mesure.',
      veryLow: 'Très bas sous',
      target: 'Plage cible',
      targetRange: '{{min}} à {{max}}',
      veryHigh: 'Très haut au-dessus de',
      shared: 'Ce que le patient a partagé',
    },
    glucose: {
      chartTitle: 'Glycémies',
      chartA11y:
        'Graphique des glycémies : {{count}} mesures, plage cible du patient de {{min}} à {{max}}. Le tableau ci-dessous donne chaque valeur.',
      target: 'Plage cible',
      table: 'Toutes les mesures',
      when: 'Date et heure',
      value: 'Valeur',
      state: 'État',
      context: 'Moment',
      source: 'Provenance',
      note: 'Note du patient',
      noNote: '—',
      empty: 'Aucune mesure sur cette période.',
      more: 'Seules les {{count}} mesures les plus récentes sont affichées.',
      shown: '{{shown}} mesures affichées sur {{total}}',
      showMore: 'Afficher plus de mesures',
    },
    timeline: {
      empty: 'Rien sur cette période.',
      emptyKind: {
        TREATMENT: 'Aucun traitement déclaré sur cette période.',
        MEAL: 'Aucun repas noté sur cette période.',
        ACTIVITY: 'Aucune activité notée sur cette période.',
      },
      declared: 'Déclaré par le patient',
      today: 'Aujourd’hui',
      yesterday: 'Hier',
      itemA11y: '{{time}}, {{kind}} : {{text}}',
      kind: {
        MEASUREMENT: 'Glycémie',
        MEAL: 'Repas',
        ACTIVITY: 'Activité',
        TREATMENT: 'Traitement',
        ALERT: 'Alerte',
      },
      more: 'Seules les {{count}} lignes les plus récentes sont affichées.',
      showMore: 'Afficher plus',
      duration: '{{count}} min',
      detailsA11y: 'note du patient : {{details}}',
      treatmentsHint:
        'Traitements déclarés par le patient, tels qu’il les a notés. Afyabora ne calcule ni ne conseille aucune dose.',
      listA11y: 'Chronologie, du plus récent au plus ancien',
    },
    summary: {
      title: 'Observations du moteur d’analyse',
      hint: 'Calculées sur les 30 derniers jours, chacune avec les mesures qui la justifient.',
      empty: 'Aucune observation particulière sur les 30 derniers jours.',
      evidence: 'Basée sur {{count}} mesures',
      evidenceOne: 'Basée sur 1 mesure',
      disclaimer:
        'Ces observations sont statistiques et descriptives : ce ne sont ni des diagnostics ni des conseils de traitement.',
      severity: { INFO: 'Information', ATTENTION: 'À surveiller', ALERT: 'Alerte' },
      type: {
        TREND: 'Tendance',
        TIME_OF_DAY_PATTERN: 'Moment de la journée',
        ANOMALY: 'Valeur inhabituelle',
        HIGH_STREAK: 'Série de valeurs hautes',
        REPEATED_HYPO: 'Valeurs basses répétées',
        MISSING_DATA: 'Jours sans mesure',
        PERIOD_COMPARISON: 'Comparaison',
      },
    },
    states: {
      VERY_LOW: 'Très bas',
      LOW: 'En dessous',
      IN_RANGE: 'Dans la plage',
      HIGH: 'Au-dessus',
      VERY_HIGH: 'Très haut',
    },
    contexts: {
      FASTING: 'À jeun',
      BEFORE_MEAL: 'Avant repas',
      AFTER_MEAL: 'Après repas',
      BEDTIME: 'Au coucher',
      NIGHT: 'La nuit',
      OTHER: 'Autre',
    },
    report: {
      title: 'Rapport « Préparer ma consultation »',
      intro:
        'Le patient vous autorise à télécharger son rapport : une synthèse claire de ses glycémies, à garder dans son dossier ou à imprimer.',
      period: 'Période du rapport',
      download: 'Télécharger le PDF',
      downloading: 'Création du rapport…',
      contentsTitle: 'Ce que contient le rapport',
      contents: [
        'Identité du patient (prénom, nom, type de diabète, année du diagnostic) et ses plages cibles',
        'Qualité des données, nombre de mesures, moyenne, écart-type et variabilité',
        'Temps dans la plage cible, en dessous et au-dessus',
        'Épisodes en dessous et au-dessus de la cible, valeurs inhabituelles, jours sans mesure',
        'Points à examiner, graphique de toutes les mesures de la période',
      ],
      private: 'Les notes personnelles du patient ne sont jamais dans le rapport.',
      logged:
        'Chaque téléchargement est inscrit dans le journal du patient, qui voit « Rapport téléchargé ».',
      signed: 'Le rapport indique qu’il a été généré à votre demande, avec l’accord du patient.',
      done: 'Rapport téléchargé',
      doneText: '{{filename}} · à {{time}}',
      problem: {
        tooMany: {
          title: 'Trop de rapports d’un coup',
          text: 'Attendez une minute avant d’en télécharger un autre.',
        },
        notShared: {
          title: 'Le patient ne partage plus son rapport',
          text: 'Le téléchargement du rapport n’est pas autorisé pour ce partage.',
        },
        network: {
          title: 'Le serveur ne répond pas',
          text: 'Vérifiez votre connexion, puis réessayez.',
        },
        server: {
          title: 'Le rapport n’a pas pu être créé',
          text: 'Réessayez dans quelques instants.',
        },
      },
    },
    problem: {
      network: {
        title: 'Le serveur ne répond pas',
        text: 'Vérifiez votre connexion, puis réessayez.',
      },
      server: {
        title: 'Cette partie du dossier n’a pas pu être chargée',
        text: 'Réessayez dans quelques instants.',
      },
    },
    retry: 'Réessayer',
  },
  access: {
    valid: 'Accès valable : {{time}}',
    ended: 'Accès expiré',
    soon: 'Se termine bientôt',
    until: 'Fin de l’accès à {{when}}',
    a11yMinutes: 'Accès valable encore {{count}} minutes',
    a11yLastMinute: 'Accès valable moins d’une minute',
    announce5: 'Il reste 5 minutes d’accès au dossier.',
    announce1: 'Il reste 1 minute d’accès au dossier.',
  },
  expired: {
    overline: 'Dossier fermé',
    erased: 'Les données de ce dossier ont été effacées de cet ordinateur.',
    patients: 'Mes patients',
    scan: 'Scanner un nouveau QR',
    reason: {
      EXPIRED: {
        title: 'Accès expiré',
        text: 'La durée choisie par le patient est écoulée. Pour consulter à nouveau son dossier, demandez-lui de vous montrer un nouveau QR.',
      },
      REVOKED: {
        title: 'Le patient a mis fin au partage',
        text: 'Le patient a arrêté l’accès depuis son application. Il peut vous montrer un nouveau QR s’il le souhaite.',
      },
      APPROVAL: {
        title: 'Votre compte n’est plus approuvé',
        text: 'L’accès aux dossiers est réservé aux médecins dont le compte est vérifié.',
      },
      OTHER: {
        title: 'Ce dossier n’est pas accessible',
        text: 'Ce partage n’a pas été ouvert par votre compte, ou il n’existe pas.',
      },
    },
  },
  emergency: {
    overline: 'Carte d’urgence',
    confirmTitle: 'Carte d’urgence d’un patient',
    confirmText:
      'Cette carte contient les informations médicales que le patient a choisi de rendre accessibles en cas d’urgence.',
    confirmWho: 'Réservée aux professionnels de santé et aux secouristes.',
    confirm: 'Je suis un professionnel de santé ou un secouriste',
    logged: 'L’ouverture est enregistrée et le patient en est averti.',
    lifeThreat: 'En cas de danger vital, appelez d’abord les secours.',
    loading: 'Ouverture de la carte…',
    fields: {
      fullName: 'Nom',
      diabetesType: 'Diabète',
      declaredTreatment: 'Traitement déclaré',
      allergies: 'Allergies',
      bloodGroup: 'Groupe sanguin',
      lastKnownGlucoseMgDl: 'Dernière glycémie connue',
      emergencyContactName: 'Contact d’urgence',
      emergencyContactPhone: 'Téléphone du contact',
    },
    noName: 'Patient',
    call: 'Appeler',
    callA11y: 'Appeler le contact d’urgence au {{phone}}',
    empty: 'Le patient n’a renseigné aucune information sur cette carte.',
    updated: 'Informations déclarées par le patient, mises à jour le {{date}} à {{time}}.',
    glucoseHint: 'Valeur notée par le patient à cette date : elle peut avoir changé depuis.',
    disclaimer:
      'Afyabora est un outil d’aide au suivi, pas un dispositif médical : vérifiez toujours l’état du patient.',
    invalidLink: {
      title: 'Lien incomplet',
      text: 'Cette adresse ne correspond à aucune carte d’urgence. Scannez à nouveau le QR du patient.',
    },
    problem: {
      unavailable: {
        title: 'Carte indisponible',
        text: 'Cette carte d’urgence n’est pas accessible : le patient l’a peut-être désactivée ou a remplacé son QR.',
      },
      tooMany: {
        title: 'Trop d’ouvertures',
        text: 'Attendez une minute, puis réessayez.',
      },
      busy: {
        title: 'Service momentanément occupé',
        text: 'Réessayez dans quelques secondes.',
      },
      network: {
        title: 'Pas de connexion',
        text: 'Vérifiez la connexion Internet du téléphone, puis réessayez.',
      },
      error: {
        title: 'La carte n’a pas pu être ouverte',
        text: 'Réessayez dans un instant.',
      },
    },
    retry: 'Réessayer',
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
