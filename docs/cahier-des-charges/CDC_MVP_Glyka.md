# Glyka — Cahier des charges du MVP

**Projet 3 · PBL B1.1 MEO PBL5 · Carte numérique d'historique médical pour diabétiques**
Version 0.2 — 4 octobre 2026 — Statut : **validé par le chef de projet technique** (v0.2 : ajout de la **saisie hors-ligne** et des **notifications**)
Rédigé pour : Lead technique (répartition des tâches) et toute l'équipe de développement

---

## 0. Comment lire ce document

| Section | Pour qui               | À quoi ça sert                                                                            |
| ------- | ---------------------- | ----------------------------------------------------------------------------------------- |
| 1–3     | Tout le monde          | Comprendre le produit, le périmètre, les acteurs                                          |
| 4       | Tout le monde          | **Les 12 étapes (fonctionnalités) du MVP**, avec écrans, règles et critères d'acceptation |
| 5–7     | Back / Data / Sécurité | Moteur d'analyse, IA, sécurité, exigences non fonctionnelles                              |
| 8–10    | Dev                    | Stack, architecture, modèle de données, API                                               |
| 11–13   | Lead + équipe          | Organisation, planning sur 10 jours, scénario de démo                                     |
| 14–15   | Lead                   | Risques et décisions à valider                                                            |

Priorités : **P0** = obligatoire pour la démo · **P1** = fortement souhaité, fait si P0 terminé · **P2** = bonus.

---

## 1. Vision

### 1.1 Problème

Un patient diabétique note ses glycémies sur papier, dans des captures d'écran ou des fichiers dispersés. En consultation, le médecin n'a ni vue d'ensemble fiable ni moyen simple de consulter l'historique, et le patient n'a aucun contrôle sur qui voit quoi.

### 1.2 Proposition de valeur : trois piliers

| Pilier         | Promesse                                                      | Fonctionnalités clés                                                                              |
| -------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Suivre**     | « Mon historique est complet et à jour, même sans réseau »    | Saisie rapide **hors-ligne**, synchronisation, import CSV/Excel, chronologie, qualité des données |
| **Contrôler**  | « Je décide qui voit mes données, quoi, et combien de temps » | QR dynamique, consentement granulaire, révocation, journal d'accès                                |
| **Comprendre** | « Je comprends mon historique et je prépare ma consultation » | Analyse de tendances, alertes, **notifications**, résumé, rapport PDF                             |

### 1.3 Nom et identité

**Nom proposé : Glyka.** Court, facile à prononcer en français, racine « glyc- » reconnaissable, sonorité qui reste agréable à l'oreille sans faire « médical froid ». _Alternatives si l'équipe n'aime pas : Sukali, Nuru._ (À faire : vérifier disponibilité du nom, du domaine et des réseaux avant de le figer.)

- **Slogan :** _Suivez. Contrôlez. Comprenez._
- **Ton :** clair, rassurant, jamais alarmiste, jamais condescendant.
- **Identité visuelle (à décliner dans `packages/ui-tokens`) :** couleur principale teal profond, accent chaud (ambre) pour l'attention, fonds clairs sobres. Titres en _Manrope_, texte en _Inter_. Pas de dégradé violet, pas de kit UI par défaut : une identité cohérente, c'est ce qui évite l'effet « généré ».
- **Accessibilité des états glycémiques :** ne jamais coder l'état par la couleur seule. Chaque état a une couleur **et** une forme/étiquette (● dans la plage, ▲ au-dessus, ▼ en dessous).

### 1.4 Ce qui nous différencie

Les carnets de glycémie existants (type mySugr) se concentrent sur la saisie et les graphiques _(à confirmer lors de notre étude concurrentielle rapide)_. Notre MVP ajoute :

1. **Partage par consentement** : QR rotatif à usage unique, périmètre choisi, durée limitée, révocation immédiate, journal d'accès visible par le patient.
2. **IA traçable** : chaque observation est calculée par un moteur statistique vérifiable et renvoie vers les mesures qui la justifient. Le modèle de langage ne fait que reformuler, il ne calcule pas et ne diagnostique pas.
3. **Score de qualité des données** : l'app dit elle-même quand une analyse n'est pas fiable.
4. **Provenance de chaque mesure** : saisie manuelle, import, appareil.
5. **Import intelligent** : rapport de validation (valides / doublons / incohérentes) avec correction ligne par ligne.
6. **Chronologie médicale** et **rapport « Préparer ma consultation »** en PDF.
7. **Carte d'urgence** séparée, limitée aux informations choisies par le patient.
8. **Saisie hors-ligne** : l'app reste utilisable sans réseau (saisie, tableau de bord, analyse) et se synchronise toute seule au retour de la connexion.
9. **Notifications respectueuses de la vie privée** : rappels et alertes sans valeur de santé affichée par défaut sur l'écran verrouillé.

---

## 2. Périmètre du MVP

### 2.1 Décision de périmètre (matrice de décision)

Critères pondérés, notes de 1 à 5 : **Valeur utilisateur 30 %**, **Différenciation 25 %**, **Faisabilité en 10 jours 30 %**, **Exigence du guide 15 %**. Seuil d'entrée dans le MVP : **≥ 3,5**. _Notes proposées par le lead technique : à discuter et ajuster en réunion de décision (c'est aussi un livrable du PBL)._

| Fonctionnalité                        | Valeur | Diff. | Faisab. | Guide | **Score** | Décision                                |
| ------------------------------------- | ------ | ----- | ------- | ----- | --------- | --------------------------------------- |
| QR dynamique + consentement           | 5      | 5     | 3       | 5     | **4,40**  | MVP P0                                  |
| Saisie + tableau de bord              | 5      | 2     | 5       | 5     | **4,25**  | MVP P0                                  |
| Rapport PDF de consultation           | 5      | 3     | 4       | 5     | **4,20**  | MVP P0                                  |
| Import CSV/Excel avec rapport         | 4      | 4     | 4       | 5     | **4,15**  | MVP P0                                  |
| Portail médecin                       | 5      | 3     | 4       | 4     | **4,05**  | MVP P0                                  |
| Chronologie médicale                  | 4      | 4     | 5       | 2     | **4,00**  | MVP P0                                  |
| Score qualité + provenance            | 4      | 5     | 4       | 2     | **3,95**  | MVP P0                                  |
| Analyse / IA (moteur + reformulation) | 4      | 4     | 3       | 5     | **3,85**  | MVP P0                                  |
| Compte + profil médical               | 4      | 1     | 5       | 5     | **3,70**  | MVP P0                                  |
| Carte d'urgence                       | 4      | 4     | 4       | 1     | **3,55**  | MVP P1                                  |
| Notifications (locales + push)        | 4      | 2     | 4       | 4     | **3,50**  | MVP P0 _(ajout v0.2)_                   |
| Saisie hors-ligne + synchronisation   | 5      | 4     | 2       | 1     | **3,25**  | MVP P0 par **arbitrage** _(ajout v0.2)_ |
| Connexion réelle aux capteurs (CGM)   | 3      | 3     | 1       | 1     | **2,10**  | V2                                      |

> **Arbitrage v0.2 :** la saisie hors-ligne obtient **3,25**, **sous le seuil de 3,5** à cause de sa faisabilité (synchronisation, conflits, tests). Elle est intégrée au MVP par **décision explicite du chef de projet technique**, parce qu'elle répond à un besoin réel de connectivité irrégulière. Le risque est assumé et encadré : périmètre limité aux **mesures et événements** (le reste exige le réseau), architecture local-first **dès le jour 2** (ADR-0004), tests de synchronisation obligatoires, et une règle de coupe qui protège ce lot (§12).

### 2.2 Dans le MVP

| Réf. | Fonctionnalité                                                           | Priorité |
| ---- | ------------------------------------------------------------------------ | -------- |
| F1   | Compte (email + mot de passe) et profil médical                          | P0       |
| F2   | Saisie d'une mesure de glycémie                                          | P0       |
| F3   | Tableau de bord : graphiques, statistiques, qualité des données          | P0       |
| F4   | Chronologie médicale et événements (repas, activité, traitement déclaré) | P0       |
| F5   | Import CSV / Excel avec validation                                       | P0       |
| F6   | Analyse : tendances, anomalies, alertes, résumé (+ question libre en P1) | P0       |
| F7   | Partage sécurisé par QR dynamique, révocation, journal d'accès           | P0       |
| F8   | Portail médecin (web)                                                    | P0       |
| F9   | Rapport PDF « Préparer ma consultation »                                 | P0       |
| F10  | Carte d'urgence + QR urgence                                             | P1       |
| F11  | Saisie hors-ligne et synchronisation                                     | P0       |
| F12  | Notifications (rappels, alertes, activité de partage)                    | P0       |

### 2.3 Hors MVP (roadmap, à présenter comme vision)

Connexion aux capteurs (CGM) et pompes, reconnaissance de repas par photo, calcul de dose d'insuline, prédiction médicale, **estimation d'HbA1c** (volontairement exclue : trop risquée sans données de capteur continu), application pour proches aidants, paiement et abonnement réels, intégration hospitalière réelle, vérification officielle des médecins auprès de leur ordre professionnel, notifications riches (images, actions), résolution de conflits multi-appareils, version anglaise.

### 2.4 Contraintes et hypothèses

- Délai : **10 jours** (le guide parle de trois semaines avant production : on vise plus court pour livrer le MVP puis préparer la communication).
- **Android en priorité** (APK de démo). iOS seulement si le temps le permet.
- Données de démo **100 % fictives** : aucun vrai patient.
- Glyka est un **outil d'aide au suivi**, pas un dispositif médical : pas de diagnostic, pas de calcul de dose, pas de conseil thérapeutique. Ce message apparaît à l'inscription, dans l'IA et dans le rapport.
- Les seuils d'alerte par défaut sont des valeurs de départ **à faire valider par un professionnel de santé** (le guide demande des seuils définis avec eux).

---

## 3. Acteurs

| Acteur                            | Rôle                                                              | Accès                                    |
| --------------------------------- | ----------------------------------------------------------------- | ---------------------------------------- |
| **Patient**                       | Saisit, importe, analyse, partage                                 | App mobile                               |
| **Professionnel de santé**        | Consulte, pendant une durée limitée, ce que le patient a autorisé | Portail web                              |
| **Administrateur** (MVP : script) | Approuve les comptes médecins                                     | Script d'administration, pas d'interface |
| **Secouriste** (P1)               | Lit uniquement la carte d'urgence                                 | Page web publique limitée                |

---

## 4. Les étapes du MVP

Chaque étape donne : objectif · écrans · règles de gestion · critères d'acceptation (CA) testables.

### F1 — Compte et profil médical (P0)

**Objectif :** créer un compte sécurisé et un profil médical minimal exploitable par l'analyse et le médecin.

**Écrans :** bienvenue → inscription → vérification email → connexion → mot de passe oublié → assistant de profil en 3 étapes → écran Profil.

**Règles :**

- Inscription par **email + mot de passe** (12 caractères minimum). Email vérifié par lien avant la première connexion.
- Profil : prénom, nom, date de naissance, sexe, type de diabète (1, 2, gestationnel, autre), année du diagnostic, unité préférée (g/L par défaut, mmol/L, mg/dL), **plage cible** et **seuils d'alerte** (valeurs par défaut modifiables, voir §5.4), contact d'urgence (optionnel).
- Déverrouillage de l'app par **biométrie ou code** (en plus de la session).
- Consentement explicite à l'inscription (case non pré-cochée) avec lien vers la politique de confidentialité et l'avertissement « outil d'aide, pas un avis médical ».
- Compte **médecin** : inscription séparée sur le portail avec numéro d'ordre et établissement ; statut _en attente_ jusqu'à approbation par l'administrateur.

**CA :**

- Un utilisateur non vérifié ne peut pas se connecter.
- Un mot de passe de 8 caractères est refusé avec un message clair.
- Après 5 échecs de connexion en 10 minutes, le compte est temporairement verrouillé.
- Changer l'unité préférée ne modifie jamais les données stockées (voir §9).

### F2 — Saisie d'une mesure (P0)

**Objectif :** enregistrer une glycémie en moins de 10 secondes.

**Écran :** bouton « + » toujours accessible → valeur (clavier numérique) → unité → date/heure (maintenant par défaut) → contexte → note optionnelle → enregistrer.

**Règles :**

- Contexte : à jeun, avant repas, après repas, au coucher, nuit, autre.
- Source automatiquement renseignée : **Saisie manuelle** (les autres sources viennent de l'import, voir F5).
- **Hors-ligne :** la mesure est d'abord enregistrée **sur le téléphone** puis synchronisée (voir F11). L'identifiant est généré sur l'appareil.
- Bornes plausibles : de 0,20 à 6,00 g/L (soit 20 à 600 mg/dL). Hors bornes : confirmation obligatoire (« Cette valeur est inhabituelle, est-ce correct ? »).
- Date dans le futur interdite. Doublon exact (même heure, même valeur) : avertissement.
- Si la valeur franchit le seuil de **très basse** ou **très haute** : message de sécurité sobre (« Suivez les consignes de votre équipe soignante. En cas de malaise, demandez de l'aide immédiatement. »). Aucune consigne de traitement n'est donnée.
- Modification et suppression possibles ; une modification garde la trace de l'ancienne valeur (champ `editedAt`).

**CA :**

- Saisir 1,48 g/L puis passer en mg/dL affiche 148 mg/dL.
- Une valeur de 18,7 g/L déclenche la confirmation.
- La mesure apparaît immédiatement dans le tableau de bord et la chronologie.

### F3 — Tableau de bord et qualité des données (P0)

**Objectif :** voir l'essentiel en un coup d'œil.

**Contenu :**

- Dernière mesure avec état (▼ ● ▲), date et heure.
- Graphique d'évolution (7 j / 14 j / 30 j / 90 j) avec la plage cible en bande, points tapables pour voir le détail.
- Statistiques : moyenne, écart-type, **temps dans la cible, au-dessus, en dessous (%)**, variabilité (coefficient de variation), nombre de mesures.
- Comparaison avec la période précédente (flèche ↑ ↓ →).
- **Score de qualité des données** (voir §5.3) avec explication en une phrase.
- Carte « Alertes récentes » (F6).
- **Tout est calculé depuis la base locale** : le tableau de bord fonctionne sans réseau (le moteur d'analyse tourne sur le téléphone).
- Indicateur de synchronisation (« 3 mesures en attente » / « À jour »).

**CA :**

- Changer de période met à jour tous les chiffres.
- Avec moins de 10 mesures sur la période, les statistiques affichent « Données insuffisantes » plutôt qu'un pourcentage trompeur.
- Le tableau de bord s'affiche en moins de 2 s avec 5 000 mesures.

### F4 — Chronologie médicale et événements (P0)

**Objectif :** une vue unique et chronologique de tout ce qui compte, utilisée aussi par le médecin.

**Événements** (en plus des mesures) : **repas** (libellé, moment), **activité** (type, durée), **traitement déclaré** (nom et note libre, _déclaré par le patient_, sans calcul).

**Écran :** liste groupée par jour, filtres (tout, glycémie, repas, activité, traitements, alertes), badge de provenance sur chaque mesure, ajout rapide d'un événement.

**Règles :** les alertes du moteur (F6) apparaissent dans la chronologie. Chaque ligne porte un icône + un texte (pas la couleur seule).

**CA :** les éléments sont triés du plus récent au plus ancien ; filtrer « Repas » n'affiche que des repas ; un élément importé affiche son lot d'import.

### F5 — Import CSV / Excel (P0)

**Objectif :** reprendre un historique existant sans erreur silencieuse. Exigence du guide : fichiers `.xlsx` et `.csv` avec détection d'erreurs et de valeurs incohérentes.

**Parcours en 5 étapes :**

1. **Choisir** le fichier (`.csv`, `.xlsx`, 5 Mo et 5 000 lignes maximum pour le MVP) et l'unité par défaut du fichier.
2. **Faire correspondre** les colonnes (détection automatique des en-têtes date, heure, glycémie, unité, contexte ; correction manuelle possible).
3. **Analyse** côté serveur.
4. **Rapport d'importation** : lignes analysées, **valides**, **doublons**, **incohérentes**, **erreurs de format**, avec la liste détaillée (exemple : « Ligne 42 : 18,7 g/L : valeur inhabituelle, vérifier l'unité »).
5. **Décision ligne par ligne ou en lot :** Corriger · Ignorer · Accepter tel quel, puis **Importer**.

**Règles de validation :**

- Séparateur décimal virgule ou point ; dates `jj/mm/aaaa`, `aaaa-mm-jj`, avec ou sans heure ; encodage UTF-8 et Windows-1252.
- Rejet : date manquante ou illisible, valeur non numérique, date future.
- Incohérence : valeur hors bornes plausibles pour l'unité choisie, unité de la ligne différente de celle du fichier.
- Doublon : même patient, même horodatage, même valeur (avec les mesures existantes **et** à l'intérieur du fichier).
- Tout est importé dans un **lot d'import** avec source = _Import CSV/Excel_, **annulable** en un clic.
- Rien n'est écrit en base avant la confirmation de l'étape 5.

**CA :** un fichier de test contenant 147 lignes dont 5 doublons et 3 valeurs aberrantes produit exactement ce rapport ; annuler le lot supprime toutes ses mesures ; un `.xlsx` corrompu affiche une erreur compréhensible sans plantage.

### F6 — Analyse et IA (P0)

**Objectif :** aider à comprendre l'historique sans jamais se substituer au médecin (exigence du guide). Détail technique au §5.

**Fonctions :**

| Réf. | Fonction                                                                                                                                        | Priorité |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| IA-1 | **Tendances** : temps dans la cible, répartition par moment de la journée, comparaison avec la période précédente                               | P0       |
| IA-2 | **Anomalies** et situations nécessitant attention : valeurs inhabituelles, séries de valeurs hautes, hypoglycémies répétées, données manquantes | P0       |
| IA-3 | **Résumé** en langage clair, base du rapport PDF (F9)                                                                                           | P0       |
| IA-4 | **Question libre** sur son historique (« Pourquoi autant de variations cette semaine ? »)                                                       | P1       |

**Règles :**

- Chaque observation affiche **« Voir les mesures concernées »** (traçabilité).
- Formulations descriptives uniquement (« J'observe… »), jamais de diagnostic, de cause affirmée ni de conseil de traitement.
- Si la qualité des données est insuffisante, l'analyse le dit et s'arrête là.
- Les observations et leurs textes (gabarits) fonctionnent **hors-ligne** ; seules la reformulation par un modèle de langage et la question libre exigent le réseau.
- Alerte = observation + seuil franchi + rappel de consulter son professionnel de santé.

**CA :** avec un jeu de test connu, le moteur retrouve exactement les pourcentages attendus ; une question hors sujet (« Quelle dose d'insuline dois-je prendre ? ») reçoit un refus poli qui renvoie vers le médecin ; aucune réponse ne contient de diagnostic.

### F7 — Partage sécurisé par QR dynamique (P0, la fonctionnalité signature)

**Objectif :** donner au médecin un accès **temporaire, limité et révocable**. Exigences du guide : QR qui change régulièrement ou après chaque utilisation, durée de validité définissable.

**Parcours patient :**

1. **« Partager mon historique »**
2. **Choisir quoi partager :** historique glycémique · médicaments déclarés · repas · activité · résumé IA · notes personnelles (décochées par défaut).
3. **Choisir la durée :** 5 min · 30 min · 1 h · consultation en cours (maximum 2 h, le patient peut mettre fin avant).
4. **Générer le QR** : s'affiche avec un compte à rebours de rotation.
5. Le médecin scanne : l'écran passe à « **Dr X consulte votre dossier** — expire dans 04:37 » avec un bouton **Mettre fin à l'accès**.
6. À l'expiration ou à la révocation : « Accès terminé ».

**Mécanisme (résumé, détail au §6.2) :**

- Le QR contient un **jeton aléatoire opaque**, jamais de données médicales.
- Le jeton **tourne toutes les 60 secondes** et est **à usage unique** : dès qu'un médecin le scanne, il est consommé.
- Le médecin doit être **connecté et vérifié** pour utiliser le QR.
- La durée de l'accès commence au scan, et l'expiration est **contrôlée côté serveur**.
- Le serveur ne renvoie **que** les catégories cochées.

**Journal d'accès :** écran « Qui a consulté mes données » : médecin, date, durée, catégories partagées, mode de fin (expiré / révoqué).

**Hors-ligne :** le partage exige le réseau (le serveur doit émettre et contrôler les jetons) ; l'app l'indique clairement.

**CA :**

- Le même QR scanné deux fois : le second scan est refusé.
- Un QR vieux de plus de 60 s est refusé.
- Après expiration, une requête API du médecin renvoie 403, même si son navigateur affiche encore la page.
- Si « Notes personnelles » est décoché, aucune route ne les expose au médecin.
- Révoquer coupe l'accès en moins de 5 secondes.

### F8 — Portail médecin (P0)

**Objectif :** un vrai outil de consultation, pas une simple page avec un graphique.

**Écrans :**

1. Inscription / connexion médecin (statut « en attente » ou « approuvé »).
2. **Scanner** : caméra du navigateur, ou saisie d'un code de secours en cas de caméra indisponible.
3. **Mes patients partagés** : liste avec statut de l'accès (actif / expiré), dernière donnée, qualité des données.
4. **Dossier patient** (onglets) : Identité & type de diabète · Glycémie (graphique interactif) · Chronologie · Traitements déclarés · Nutrition · Activité · Résumé IA · Rapport PDF.
5. Bandeau permanent : « Accès valable : 04:37 » puis « Accès expiré » (plus aucune donnée affichée).

**Règles :** lecture seule ; seules les catégories autorisées apparaissent ; le rapport PDF n'est téléchargeable que si le patient l'a autorisé ; chaque consultation est journalisée.

**CA :** à l'expiration, les données disparaissent de l'écran et un rechargement ne les ramène pas ; un médecin _en attente_ ne peut pas scanner.

### F9 — Rapport « Préparer ma consultation » (P0)

**Objectif :** le « curriculum vitae de l'historique » demandé par le guide.

**Contenu du PDF :** identité et type de diabète · période analysée · nombre de mesures et **qualité des données** · temps dans la cible / au-dessus / en dessous · épisodes au-dessus et en dessous · événements inhabituels · jours avec données incomplètes · **points à examiner avec le professionnel** · graphique · avertissement « outil d'aide, ne remplace pas l'avis médical » · date et heure de génération, auteur du rapport.

**Règles :** période au choix (14 / 30 / 90 jours) ; le patient peut le générer lui-même ou autoriser son téléchargement par le médecin.

**CA :** les chiffres du PDF sont identiques à ceux du tableau de bord ; le PDF se génère en moins de 10 s pour 90 jours de données.

### F10 — Carte d'urgence (P1)

**Objectif :** une fiche minimale pour les situations d'urgence, **séparée** du partage médical.

**Contenu choisi par le patient :** nom, type de diabète, traitement déclaré, allergies, groupe sanguin, dernière glycémie connue, contact d'urgence, date de dernière mise à jour. **Aucun historique.**

**Mécanisme :**

- **QR urgence** distinct du QR de consultation, stable pour pouvoir être imprimé ou mis en fond d'écran ; export en image.
- Le lecteur arrive sur une page publique limitée, après confirmation « Je suis un professionnel de santé ou un secouriste ».
- Chaque ouverture est **journalisée et notifiée** au patient dans l'app ; le patient peut **désactiver ou régénérer** le QR à tout moment.

**Limite assumée :** le QR urgence n'exige pas de compte, c'est son but ; c'est pourquoi le contenu est strictement limité aux champs choisis. À documenter dans la politique de confidentialité.

**CA :** désactiver le QR le rend immédiatement inopérant ; aucune donnée de glycémie historique n'est accessible depuis cette page.

### F11 — Saisie hors-ligne et synchronisation (P0, ajout v0.2)

**Objectif :** enregistrer une mesure ou un événement **sans réseau** ; les données rejoignent la base de données à la reconnexion, sans doublon ni perte. Architecture : **ADR-0004** (local-first).

**Parcours patient :**

1. Sans réseau, le patient saisit une mesure : elle est enregistrée **sur le téléphone** ; le bandeau indique « Hors ligne : vos données sont enregistrées sur ce téléphone » et « 2 mesures en attente de synchronisation ».
2. Le réseau revient (ou le patient ouvre l'app, ou tire pour rafraîchir) : **synchronisation automatique**. Le compteur retombe à 0.
3. Les modifications faites ailleurs (autre appareil, import) sont récupérées au passage.

**Règles :**

- Toute écriture va **d'abord en local** et empile une opération dans une **outbox**, dans la **même transaction**.
- Identifiants (UUID) générés **sur l'appareil** ; chaque opération porte un `opId` traité **une seule fois** par le serveur (idempotence).
- Envoi par lots de 200 maximum ; une opération invalide est rejetée avec sa raison **sans bloquer les autres**.
- Suppression = marqueur de suppression (_tombstone_) propagé à la synchronisation.
- **Conflit :** la dernière écriture gagne (selon l'horloge de l'appareil) ; le cas nominal est un seul appareil actif.
- Une `measuredAt` à plus de 5 minutes dans le futur est rejetée (dérive d'horloge).
- Reprise automatique avec délai croissant en cas d'échec réseau (2 s, 4 s, 8 s… maximum 5 minutes).

| Fonctionne hors-ligne                                                                                             | Exige le réseau                                                                                   |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Saisie, modification, suppression, tableau de bord, chronologie, analyse par gabarits, rappels et alertes locales | Inscription et connexion, import, partage par QR, rapport PDF, carte d'urgence, question libre IA |

**CA :**

- En **mode avion**, 5 mesures saisies apparaissent dans l'app ; au retour du réseau, elles sont en base **une seule fois chacune**.
- Rejouer le même lot d'opérations ne crée aucun doublon.
- Une mesure supprimée hors-ligne est supprimée côté serveur après synchronisation.
- Une opération invalide dans un lot n'empêche pas les autres d'être appliquées.
- Fermer l'app en pleine synchronisation puis la rouvrir : aucune perte, aucun doublon.

### F12 — Notifications (P0, ajout v0.2)

**Objectif :** rappeler, alerter et informer, **sans exposer de donnée de santé** sur un écran verrouillé. Décisions : **ADR-0006**.

| Notification                                                    | Type              | Hors-ligne |
| --------------------------------------------------------------- | ----------------- | ---------- |
| Rappel de mesure (heures choisies par le patient)               | Locale            | Oui        |
| Alerte de seuil franchi (bas, très bas, haut, très haut)        | Locale            | Oui        |
| « Pas de mesure depuis X heures » (X réglable, 24 h par défaut) | Locale            | Oui        |
| Un médecin consulte votre dossier / l'accès est terminé         | Push serveur      | Non        |
| La carte d'urgence a été ouverte                                | Push serveur (P1) | Non        |
| Import terminé                                                  | Push serveur (P1) | Non        |

**Écran de préférences :** activer/désactiver par catégorie, rappels programmables (jours et heures), **heures calmes**, délai « pas de mesure », option « afficher les valeurs sur l'écran verrouillé » (**désactivée par défaut**).

**Règles :**

- **Par défaut, aucune valeur de santé dans le texte** : « Nouvelle alerte Glyka : ouvrez l'app ».
- Alerte de seuil : au plus **une par heure** et par type d'état, pour éviter le harcèlement _(proposition à valider)_. Elle rappelle de suivre les consignes de l'équipe soignante, sans conseil de traitement.
- Préférences et heures calmes respectées avant tout envoi.
- Push : jeton d'appareil enregistré à la connexion ; jetons invalides supprimés ; file d'envoi côté serveur.
- Le push Android exige un **development build** et la configuration de Firebase Cloud Messaging (pas Expo Go).

**CA :**

- Un rappel programmé à 07:00 se déclenche **en mode avion**.
- Saisir une valeur très haute déclenche une alerte locale dont le texte ne contient pas la valeur.
- Une catégorie désactivée n'envoie rien ; une notification n'arrive pas pendant les heures calmes.
- Quand un médecin scanne le QR, le patient reçoit « Un professionnel consulte votre dossier ».

---

## 5. Moteur d'analyse et IA

### 5.1 Principe : le calcul est déterministe, l'IA reformule

```
Mesures ─► [packages/analytics : calculs vérifiables] ─► Faits (JSON) + preuves
                                                           │
                                  ┌────────────────────────┴───────────────┐
                                  ▼                                        ▼
                      Gabarits de texte (toujours disponibles)   LlmProvider (optionnel)
                                  │                                        │
                                  └────────────► Garde-fous ◄──────────────┘
                                                      │
                                                      ▼
                                          Texte affiché + « Voir les mesures »
```

- **Tous les chiffres viennent du moteur**, jamais du modèle de langage.
- Le modèle reçoit uniquement des **faits agrégés et pseudonymisés** (pas de nom, pas d'email) pour rédiger.
- Si le modèle est indisponible ou lent, des **gabarits de texte** prennent le relais : la démo ne dépend jamais d'une API externe.
- Le fournisseur de modèle est derrière une interface (`LlmProvider`) pour pouvoir en changer.

### 5.2 Calculs (IA-1, IA-2)

| Indicateur                                    | Définition                                                                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Temps dans la cible / au-dessus / en dessous  | % de mesures dans / au-dessus / en dessous de la plage cible du patient                                                                         |
| Moyenne, écart-type, coefficient de variation | Sur la période choisie                                                                                                                          |
| Créneaux horaires                             | Matin, midi, soir, nuit : comparaison des proportions de valeurs hautes ; signalée seulement si au moins 5 mesures par créneau et écart notable |
| Anomalie statistique                          | Score z modifié (médiane et MAD) sur 30 jours ; signalée au-delà de 3,5                                                                         |
| Série haute                                   | 3 mesures consécutives au-dessus du seuil haut                                                                                                  |
| Hypoglycémies répétées                        | 2 mesures ou plus sous le seuil bas sur 7 jours                                                                                                 |
| Données manquantes                            | Jours sans aucune mesure, durée sans mesure                                                                                                     |
| Comparaison                                   | 7 derniers jours vs 7 jours précédents                                                                                                          |

### 5.3 Score de qualité des données (0–100)

`Score = 0,5 × Couverture + 0,3 × Densité + 0,2 × Fraîcheur`

- **Couverture** = jours avec au moins une mesure ÷ jours de la période.
- **Densité** = min(1, moyenne de mesures par jour couvert ÷ cible de 3).
- **Fraîcheur** = 100 si dernière mesure ≤ 1 jour, décroît linéairement jusqu'à 0 à 7 jours.
- Niveaux : **Bonne** ≥ 75 · **Partielle** 40–74 · **Insuffisante** < 40.
- Règle de blocage : en dessous de 10 mesures sur la période, pas d'analyse (« Données insuffisantes »).

_La formule est une proposition simple et explicable : à valider, mais elle doit rester documentée dans `docs/`._

### 5.4 Seuils par défaut (à valider avec un professionnel de santé)

| Paramètre          | Valeur par défaut                |
| ------------------ | -------------------------------- |
| Plage cible        | 0,70 à 1,80 g/L (70 à 180 mg/dL) |
| Seuil bas (alerte) | < 0,70 g/L                       |
| Seuil très bas     | < 0,54 g/L (54 mg/dL)            |
| Seuil haut         | > 1,80 g/L                       |
| Seuil très haut    | > 2,50 g/L (250 mg/dL)           |

Modifiables par le patient dans son profil (avec la mention « à définir avec votre médecin »). Conversions : 1 g/L = 100 mg/dL ≈ 5,55 mmol/L.

### 5.5 Garde-fous de l'IA

- Jamais de diagnostic, de dose, de changement de traitement, de prédiction médicale.
- Formulations descriptives (« J'observe… »), jamais de cause affirmée.
- Rappel de consulter un professionnel de santé quand une alerte est affichée.
- Les questions hors périmètre reçoivent un refus poli.
- Journalisation des réponses de l'IA pour pouvoir les auditer.
- Un jeu de **questions de test** (diagnostic, dose, urgence, détournement) est rejoué à chaque changement de prompt.

---

## 6. Sécurité et confidentialité

### 6.1 Mesures de base

| Domaine             | Exigence                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Transport           | HTTPS partout                                                                                                                        |
| Mots de passe       | Hachage Argon2id ; jamais en clair, jamais dans les logs                                                                             |
| Sessions            | Jeton d'accès court (15 min) + jeton de rafraîchissement **rotatif**, stocké haché côté serveur ; stockage sécurisé sur le téléphone |
| Données sensibles   | Notes personnelles chiffrées au niveau du champ (AES-256-GCM)                                                                        |
| Validation          | Toutes les entrées validées côté serveur (Zod) ; requêtes paramétrées via l'ORM                                                      |
| Limitation de débit | Connexion, scan de QR, génération d'IA                                                                                               |
| Autorisation        | Chaque route vérifie le rôle **et** la propriété de la donnée                                                                        |
| Journalisation      | Journal d'audit des accès aux données patient                                                                                        |
| Secrets             | Jamais dans le dépôt Git (variables d'environnement, `.env.example` seulement)                                                       |

### 6.2 Cycle de vie d'un partage

```
Patient            Serveur                          Médecin (connecté)
  │  POST /shares (catégories, durée)   │                    │
  │────────────────────────────────────►│ session PENDING    │
  │◄──── jeton QR (60 s, haché en base) │                    │
  │   … rotation toutes les 60 s …      │                    │
  │                                     │◄── scan + POST /shares/claim
  │                                     │  jeton consommé (atomique)
  │                                     │  session ACTIVE, expire à t + durée
  │◄── « Dr X consulte » (SSE / poll)   │──► données filtrées par catégories
  │  DELETE /shares/:id (révocation)    │                    │
  │────────────────────────────────────►│ session REVOKED    │
  │                                     │──► 403 dès la requête suivante
```

Points clés : seul le **hash** du jeton est stocké ; consommation atomique (deux scans simultanés : un seul gagne) ; le médecin est rattaché à la session ; le filtre de catégories est appliqué **côté serveur** ; l'horloge de référence est celle du serveur.

### 6.3 Vie privée

- Minimisation : on ne collecte que ce qui sert.
- Le patient peut **exporter ses données** et **supprimer son compte** (P1).
- Les données de démo sont fictives et signalées « DÉMO ».
- Cadre légal local de protection des données de santé : à vérifier avec l'encadrement avant toute mise sur le marché.

---

## 7. Exigences non fonctionnelles

| Domaine       | Exigence                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Performance   | Écrans principaux < 2 s ; API p95 < 500 ms hors génération PDF et IA                                                                             |
| Réseau        | Réponses légères, pagination, compression : utilisable sur connexion moyenne                                                                     |
| Accessibilité | Contraste AA, taille de police adaptable, états jamais codés par la couleur seule                                                                |
| Langue        | Français par défaut, textes externalisés (i18n) pour ajouter l'anglais                                                                           |
| Plateformes   | Android (prioritaire), iOS si possible, portail web (Chrome, Edge, Firefox)                                                                      |
| Fiabilité     | Aucune perte ni doublon de mesure : identifiant généré sur l'appareil, opérations idempotentes, synchronisation reprise après interruption (F11) |
| Hors-ligne    | Saisie, tableau de bord, chronologie et analyse par gabarits utilisables sans réseau                                                             |
| Qualité       | Tests automatisés sur les modules critiques (§11.3)                                                                                              |

---

## 8. Architecture technique et outils

### 8.1 Stack proposée

| Couche            | Choix                                                                                                                                                                                                                                                         | Pourquoi                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Dépôt             | **Monorepo** pnpm + Turborepo                                                                                                                                                                                                                                 | Types et règles partagés, une seule CI                    |
| Mobile            | **React Native + Expo**, TypeScript, Expo Router                                                                                                                                                                                                              | Un seul code Android/iOS, APK de démo rapide              |
| Mobile (libs)     | TanStack Query, `expo-secure-store`, `expo-local-authentication`, `expo-document-picker`, `react-native-qrcode-svg`, i18next, graphiques `react-native-svg`, **`expo-sqlite`** (base locale), **`@react-native-community/netinfo`**, **`expo-notifications`** | Besoins du MVP couverts                                   |
| Portail médecin   | **React + Vite**, TypeScript, Tailwind, Recharts, scanner QR navigateur                                                                                                                                                                                       | Rapide, déployable partout                                |
| API               | **NestJS** (TypeScript)                                                                                                                                                                                                                                       | Structure modulaire imposée, adaptée au travail en équipe |
| Base de données   | **PostgreSQL** + **Prisma**                                                                                                                                                                                                                                   | Relations solides, migrations versionnées                 |
| Validation        | **Zod** (schémas partagés dans `packages/shared`)                                                                                                                                                                                                             | Une seule définition pour mobile, portail et API          |
| Auth              | Argon2id, JWT court + refresh rotatif, envoi d'emails par SMTP                                                                                                                                                                                                | Voir §6                                                   |
| Import            | `papaparse` (CSV), `exceljs` ou SheetJS (XLSX)                                                                                                                                                                                                                | Parsing côté serveur                                      |
| PDF               | `@react-pdf/renderer`                                                                                                                                                                                                                                         | Composants réutilisables                                  |
| Hors-ligne        | SQLite locale + outbox ; API `/sync/push` et `/sync/pull`                                                                                                                                                                                                     | ADR-0004                                                  |
| Notifications     | `expo-notifications` (locales), Expo Push (serveur), tâche planifiée `@nestjs/schedule`                                                                                                                                                                       | ADR-0006 ; _development build_ requis                     |
| Analyse           | `packages/analytics` (TypeScript pur, sans dépendance réseau)                                                                                                                                                                                                 | Testable seul                                             |
| Documentation API | OpenAPI / Swagger généré par NestJS                                                                                                                                                                                                                           | Contrat commun mobile / portail / API                     |
| Infra             | Docker Compose en local, GitHub Actions (lint, types, tests), hébergement gratuit ou peu coûteux pour l'API et le portail, EAS Build pour l'APK                                                                                                               | Reproductible par tous                                    |
| Conception        | Figma (maquettes), GitHub Projects (kanban), Bruno ou Postman (tests d'API)                                                                                                                                                                                   | Collaboration                                             |

### 8.2 Structure du dépôt (niveau dossiers)

```
glyka/
├─ apps/
│  ├─ mobile/            # app patient (Expo)
│  ├─ portal/            # portail médecin (Vite + React)
│  └─ api/               # API NestJS
│     └─ src/modules/    # auth · patients · measurements · events · sync
│                        # imports · insights · sharing · doctor · audit
│                        # reports · emergency · notifications · health
├─ packages/
│  ├─ shared/            # types, schémas Zod, unités, seuils, constantes
│  ├─ analytics/         # moteur stats / anomalies / qualité (pur, testé)
│  └─ ui-tokens/         # couleurs, typographie, espacements
├─ docs/                 # cahiers des charges, décisions (ADR), API, démo
├─ infra/                # docker-compose, workflows CI
└─ scripts/              # données de démo (seed), admin (approbation médecins)
```

_L'arborescence détaillée, fichier par fichier, est livrée dans le dépôt et dans `ARBORESCENCE_GLYKA.md`._

---

## 9. Modèle de données (aperçu)

| Entité                   | Champs principaux                                                                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                   | id, email, passwordHash, role (PATIENT, DOCTOR, ADMIN), emailVerifiedAt                                                                                                                                                                                                                                          |
| `PatientProfile`         | userId, prénom, nom, naissance, sexe, diabetesType, diagnosisYear, unité préférée, plage cible, seuils, contact d'urgence                                                                                                                                                                                        |
| `DoctorProfile`          | userId, numéro d'ordre, établissement, verificationStatus                                                                                                                                                                                                                                                        |
| `Measurement`            | id (**UUID généré par le client**), patientId, **valueMgDl** (entier, unité canonique), originalValue, originalUnit, measuredAt, context, **source** (MANUAL / IMPORT / DEVICE), importBatchId, noteEncrypted, clientUpdatedAt, editedAt, updatedAt, **deletedAt** (suppression logique pour la synchronisation) |
| `LifeEvent`              | id (UUID client), patientId, type (MEAL / ACTIVITY / TREATMENT), occurredAt, label, details, clientUpdatedAt, updatedAt, deletedAt                                                                                                                                                                               |
| `ImportBatch`            | id, patientId, fichier, statut, comptes (valides, doublons, incohérentes, erreurs), createdAt, revertedAt                                                                                                                                                                                                        |
| `Insight`                | id, patientId, type, severity, facts (JSON), evidenceMeasurementIds, createdAt                                                                                                                                                                                                                                   |
| `ShareSession`           | id, patientId, categories[], durée, status (PENDING / ACTIVE / EXPIRED / REVOKED), claimedByDoctorId, claimedAt, expiresAt, revokedAt                                                                                                                                                                            |
| `ShareToken`             | sessionId, tokenHash, expiresAt, usedAt                                                                                                                                                                                                                                                                          |
| `AccessLog`              | id, patientId, actorId, sessionId, action, at, ip                                                                                                                                                                                                                                                                |
| `EmergencyCard`          | patientId, champs choisis, tokenHash, enabled, updatedAt                                                                                                                                                                                                                                                         |
| `RefreshToken`           | userId, tokenHash, familyId, expiresAt, rotatedAt                                                                                                                                                                                                                                                                |
| `SyncOpLog`              | opId, patientId, deviceId, result, appliedAt _(idempotence de la synchronisation)_                                                                                                                                                                                                                               |
| `Device`                 | id, userId, expoPushToken, platform, lastSeenAt                                                                                                                                                                                                                                                                  |
| `NotificationPreference` | patientId, settings (catégories, rappels, heures calmes)                                                                                                                                                                                                                                                         |
| `NotificationOutbox`     | userId, category, title, body, status, scheduledAt, sentAt                                                                                                                                                                                                                                                       |

**Choix d'unité :** tout est stocké en mg/dL (entier), car 1,48 g/L = 148 mg/dL exactement ; la valeur d'origine et son unité sont conservées pour la provenance et l'affichage fidèle.

---

## 10. Contrat d'API (aperçu)

| Domaine             | Routes principales                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Auth                | `POST /auth/register` · `/auth/verify-email` · `/auth/login` · `/auth/refresh` · `/auth/forgot-password` · `/auth/reset-password` |
| Profil              | `GET/PUT /me/profile`                                                                                                             |
| Mesures             | `GET /measurements?from&to` · `POST /measurements` · `PUT/DELETE /measurements/:id`                                               |
| Événements          | `GET/POST /events` · `PUT/DELETE /events/:id`                                                                                     |
| Import              | `POST /imports/preview` · `POST /imports/:id/commit` · `DELETE /imports/:id`                                                      |
| Analyse             | `GET /insights?period` · `POST /insights/ask` (P1) · `GET /quality?period`                                                        |
| Partage             | `POST /shares` · `GET /shares/:id/token` (rotation) · `GET /shares/:id/status` · `DELETE /shares/:id` · `GET /shares/log`         |
| Médecin             | `POST /shares/claim` · `GET /doctor/sessions` · `GET /doctor/sessions/:id/{summary,measurements,timeline,report}`                 |
| Rapport             | `GET /reports/consultation?period`                                                                                                |
| Urgence             | `GET/PUT /emergency` · `POST /emergency/regenerate` · `GET /e/:token` (public limité)                                             |
| **Synchronisation** | `POST /sync/push` (≤ 200 opérations) · `GET /sync/pull?cursor&limit`                                                              |
| **Notifications**   | `POST /devices` · `GET/PUT /notifications/preferences`                                                                            |

Le contrat OpenAPI est **gelé en v0 au jour 1** : mobile et portail développent contre lui avant que l'API soit prête (données simulées).

---

## 11. Organisation d'équipe et qualité

### 11.1 Lots de travail (pour la répartition des tâches)

| Lot                               | Contenu                                                                                              | Dépend de |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| **L0** Socle                      | Monorepo, CI, Docker, schéma de base de données, contrat OpenAPI v0                                  | —         |
| **L1** Auth & profil              | F1 (API + mobile + portail médecin)                                                                  | L0        |
| **L2** Mesures & tableau de bord  | F2, F3, F4                                                                                           | L0, L8    |
| **L3** Analyse                    | `packages/analytics`, moteur d'insights, gabarits, `LlmProvider`                                     | L0        |
| **L4** Import                     | F5 (API + assistant mobile)                                                                          | L0        |
| **L5** Partage & médecin          | F7, F8, journal d'accès                                                                              | L1        |
| **L6** Rapport & urgence          | F9, F10                                                                                              | L2, L3    |
| **L7** Design & contenu           | Maquettes Figma, tokens, textes, jeu de données de démo, vidéo/slides                                | —         |
| **L8** Hors-ligne & notifications | F11, F12 : base SQLite locale, outbox, synchronisation (mobile + API), notifications locales et push | L0        |

### 11.2 Règles de collaboration

- **Branches :** `main` (protégée) ← `develop` ← `feat/<lot>-<sujet>`. Aucune poussée directe sur `main`.
- **Commits** au format « conventional commits » (`feat:`, `fix:`, `docs:`…).
- **Pull request obligatoire**, relue par au moins une personne, avec une checklist (tests, doc, pas de secret).
- **Une tâche = une issue GitHub** avec critères d'acceptation repris de ce document.
- **Rituels :** daily de 10 minutes (hier / aujourd'hui / blocages), compte rendu et plan d'action tenus à jour. C'est exactement ce que le PBL demande d'observer.

### 11.3 Charte « pas vibecodé »

L'objectif est que **chaque membre puisse expliquer chaque ligne qu'il a poussée**.

- Pas de code collé sans être compris ; un code généré doit être relu, adapté et testé.
- **Décisions écrites** : un court fichier ADR dans `docs/adr/` pour chaque choix structurant (stack, unité canonique, mécanisme de QR, formule de qualité).
- **Tests obligatoires** sur : conversion d'unités, validation d'import, moteur d'analyse, score de qualité, cycle de vie des jetons QR, contrôle d'accès du portail, **synchronisation hors-ligne (idempotence, conflits, suppressions)**.
- Lint + formatage + typage strict dans la CI : une PR qui échoue ne fusionne pas.
- Design cohérent : composants issus de `ui-tokens`, aucun écran « par défaut ».
- Données de démo réalistes (90 jours, plusieurs profils de qualité) générées par script, pas à la main.

---

## 12. Planning sur 10 jours

Le détail (105 tickets avec lot, taille et dépendances) est dans `docs/team/backlog.md` et `docs/team/plan-de-travail.md`.

| Jour    | Objectif                                                                                                        | Tickets |
| ------- | --------------------------------------------------------------------------------------------------------------- | ------- |
| **J1**  | Cadrage et socle : dépôt, CI, Docker, schéma de base, **contrat OpenAPI v0 gelé**, maquettes, ADR validées      | 11      |
| **J2**  | Comptes + **fondations local-first** : auth API/mobile, base SQLite locale, APK de développement, composants UI | 14      |
| **J3**  | Mesures local-first : saisie hors-ligne, outbox, tableau de bord v1, profil, compte médecin                     | 13      |
| **J4**  | Chronologie et analyse sur le téléphone ; API de synchronisation (push/pull) ; analyseurs d'import              | 17      |
| **J5**  | **Moteur de synchronisation mobile** ; assistant d'import ; API de partage ; écran Analyse                      | 17      |
| **J6**  | **QR dynamique**, portail (scan, claim, liste), notifications locales                                           | 10      |
| **J7**  | Dossier patient côté médecin, journal d'accès, IA reformulée avec garde-fous, tests de sécurité du partage      | 9       |
| **J8**  | Rapport PDF, carte d'urgence, push serveur                                                                      | 8       |
| **J9**  | **Gel des fonctionnalités à midi** ; intégration ; test hors-ligne sur téléphone réel ; corrections ; APK       | 4       |
| **J10** | Présentation : répétition, support, README, plan de communication                                               | 2       |

**Charge :** 105 tickets (dont plusieurs XL à découper) en 10 jours exigent une équipe répartie par lots ; les jours **J4 et J5 sont les plus chargés**. Le mode hors-ligne ajoute une charge réelle : le moteur de synchronisation (L8-06) doit démarrer au plus tard le jour 5, et la base locale dès le jour 2.

**Règle de coupe si le temps manque, dans cet ordre :** 1) carte d'urgence (F10) → 2) question libre IA (IA-4) → 3) onglets Nutrition/Activité du portail → 4) push serveur (L8-16) → 5) écran de préférences détaillé (garder un réglage minimal).
**On ne coupe jamais :** le partage par QR (F7), l'import (F5), la saisie hors-ligne et sa synchronisation (F11), les notifications locales (rappels et alertes).

## 13. Scénario de démonstration (≈ 7 minutes)

1. **Inscription** d'un patient fictif, profil en 3 étapes (30 s).
2. **Import** d'un fichier de 147 lignes : rapport (139 valides, 5 doublons, 3 incohérentes), correction de la ligne 42, import (1 min).
3. **Tableau de bord** : graphique 30 jours, temps dans la cible, **score de qualité** (30 s).
4. **Hors-ligne** : mode avion, saisie de 2 mesures, « 2 mesures en attente », retour du réseau, synchronisation automatique (1 min).
5. **Notifications** : rappel programmé ; alerte de seuil sans valeur de santé sur l'écran verrouillé (30 s).
6. **IA** : tendance du soir détectée, **« Voir les mesures concernées »** ; question piège (dose d'insuline) refusée proprement (1 min).
7. **Partage** : cases cochées, durée 5 min, QR qui tourne ; le médecin scanne depuis le portail ; dossier visible ; le patient voit « Dr X consulte » (1 min 30).
8. **Révocation** : le portail affiche « Accès expiré » ; **journal d'accès** consulté (30 s).
9. **Rapport PDF** (20 s). **Carte d'urgence** et QR urgence (30 s, si prête).
10. **Roadmap** : capteurs, version commerciale, vérification des médecins (30 s).

_Version détaillée avec comptes de démonstration : `docs/demo/scenario.md`._

---

## 14. Risques

| Risque                                                 | Impact                                   | Réponse                                                                                                  |
| ------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Équipe de niveaux inégaux                              | Retards                                  | Lots indépendants, contrat d'API gelé, revue de code, binômes                                            |
| QR trop ambitieux                                      | Fonction signature absente               | Priorité absolue, développée J5–J7, testée en continu                                                    |
| API de modèle de langage indisponible ou payante       | Démo bloquée                             | Gabarits de texte intégrés, `LlmProvider` remplaçable                                                    |
| Données de santé réelles                               | Risque éthique et juridique              | Uniquement des données fictives                                                                          |
| Dérive de périmètre                                    | MVP non fini                             | Matrice de décision + règle de coupe (§12)                                                               |
| Mauvaise connexion le jour de la démo                  | Démo ratée                               | Version locale (Docker) + vidéo de secours                                                               |
| Perception « généré par IA »                           | Crédibilité                              | Charte §11.3, ADR, tests, identité visuelle propre                                                       |
| **Synchronisation hors-ligne plus complexe que prévu** | Pertes ou doublons de données, retards   | Local-first dès J2, idempotence, tests de conflits (L8-09), test en mode avion sur téléphone réel dès J5 |
| **Push Android (development build, Firebase)**         | Notifications serveur absentes le jour J | Build de développement dès J2 (L0-11) ; les notifications **locales** ne dépendent pas de Firebase       |
| **Charge totale (105 tickets)**                        | MVP non terminé                          | Équipe répartie par lots, règle de coupe (§12), découpage des tickets XL                                 |

---

## 15. Décisions à valider en réunion (avec ordre du jour proposé)

1. **Stack** : React Native + Expo / NestJS / PostgreSQL / monorepo. D'accord ?
2. **Nom** : Glyka, ou une des alternatives ?
3. **Taille de l'équipe et lots** : qui prend quel lot (rôles à confirmer) ?
4. **Android seul** pour la démo ?
5. **Modèle de langage** : quel fournisseur, quel budget, ou démonstration avec gabarits uniquement ?
6. **Seuils par défaut** : trouve-t-on un professionnel de santé pour les relire avant la démo ?
7. **Périmètre** : accepte-t-on la matrice (§2.1) et la règle de coupe (§12) ?
8. **Hors-ligne (ajout v0.2)** : valider l'ADR-0004 (architecture local-first dès le jour 2).
9. **Notifications (ajout v0.2)** : push serveur avec _development build_ et Firebase : qui s'en occupe, et à quel jour ?

---

## 16. Suite

Après validation de ce document :

1. ✅ **Arborescence détaillée du dépôt** : livrée (`glyka-repo.zip` et `ARBORESCENCE_GLYKA.md`).
2. **Cahier des charges complet de l'application commerciale** (V1 vendable : abonnement, capteurs, hors-ligne, proches aidants, conformité, modèle économique).
3. **Plan de communication de lancement** (cible, identité, canaux), attendu par le guide du PBL.
