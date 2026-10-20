# Feature `profile` — Profil médical et paramètres de santé

**Lot L1 · Fonctionnalité F1**

Assistant de profil, unité préférée, plage cible et seuils, contacts.

## Tickets

- **L1-05** — API : profil patient et seuils d'alerte (validation Zod) — **fait**
- **L1-08** — Mobile : assistant de profil — **fait** (4 étapes + résumé, décision du 2026-10-10)
- **L9-04** — Mobile : saisie du pays et du numéro d'urgence (étape 4) — **fait** (contrat 0.4.0, API L9-03)
- **L1-05 (mobile)** — Réglages ⇒ Unités et seuils — **fait** (voir plus bas)

## Assistant (`app/(onboarding)/profile-setup.tsx`)

| Étape              | Contenu                                                                                                                           | Obligatoire                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1. Qui êtes-vous ? | prénom, nom, date de naissance (JJ/MM/AAAA, « / » ajoutés pendant la frappe), sexe                                                | oui                                 |
| 2. Votre diabète   | type (1, 2, gestationnel, autre), année du diagnostic                                                                             | type : oui ; année : non            |
| 3. Unité et seuils | unité (g/L par défaut, mg/dL, mmol/L), plage cible (de / à), seuils très bas / très haut, case « définis avec mon médecin »       | oui (valeurs par défaut proposées)  |
| 4. Vos contacts    | un proche (nom, téléphone, lien) ; le médecin traitant (nom, téléphone) ; **en cas d'urgence** : pays et numéro d'urgence (L9-04) | non, mais complet s'il est commencé |
| Résumé             | une carte par étape avec « Modifier », puis « Enregistrer mon profil »                                                            | —                                   |

- **On ne passe à l'étape suivante que si elle est valide.** La validation utilise le schéma du serveur (`patientProfileSchema`, `@glyka/shared`) : on ne garde que les erreurs des champs de l'étape. Message sous chaque champ (i18n `onboarding.errors.*`).
- **Seuils** : saisis dans l'unité choisie (virgule ou point), envoyés en **mg/dL entiers** (ADR-0002). Changer d'unité convertit les valeurs affichées. Mention « à définir avec votre médecin », bouton « Revenir aux valeurs par défaut », barre colorée des 5 zones (couleurs des états, jamais rouge, symbole dans chaque zone).
- **Fin** : `PUT /me/profile`, écran « Bienvenue », puis `markProfileCompleted()` (session, L1-07) et ouverture des onglets.
- Animations : étape qui glisse (droite = suivant, gauche = retour), barre de progression, écran qui remonte en haut à chaque étape (`Screen scrollKey`).
- **En cas d'urgence (L9-04)** : pays choisi en un appui parmi `SUGGESTED_COUNTRIES` (RD Congo d'abord, public de Kinshasa, puis Congo, Rwanda, Burundi, Ouganda, Angola, France, Belgique) ou « Autre pays » avec son code à 2 lettres (mis en majuscules) ; « Ne pas indiquer de pays » efface le choix. Numéro d'urgence saisi par la personne : **Afyabora ne le devine jamais** (message sous le titre de la carte). Tous deux facultatifs ; « Autre » sans code valide ou un numéro qui n'en est pas un ⇒ erreur sous le champ. Résumé : « RD Congo · 112 ». L'assistant les affichera en cas d'urgence avec le médecin et le proche (L9-06). Modifiables après l'inscription quand l'écran Profil sera construit.
- Traitement, allergies, groupe sanguin : **carte d'urgence** (L6-06), pas dans le profil.

## Fichiers

| Fichier                               | Rôle                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `wizard.ts`                           | Logique sans interface : brouillon, conversions d'unités, dates, validation par étape, requête finale |
| `api.ts`                              | `GET` / `PUT /me/profile`                                                                             |
| `components/StepProgress.tsx`         | « Étape 2 sur 4 », barre animée, titre                                                                |
| `components/ThresholdBar.tsx`         | Aperçu des 5 zones de glycémie                                                                        |
| `components/ThresholdsEditor.tsx`     | Saisie unité + seuils (assistant étape 3 et Réglages ⇒ Unités et seuils)                              |
| `settings.ts` / `useUnitsSettings.ts` | Réglages ⇒ Unités et seuils : logique (testée) et branchement sur l'API                               |
| `__tests__/wizard.test.ts`            | Unités, dates, validation de chaque étape, requête finale                                             |

Composant partagé ajouté : `ChoiceGroup` (`src/components/ui`), choix unique en pastilles.

## Réglages ⇒ Unités et seuils (`app/settings/units-thresholds.tsx`, L1-05 mobile)

- Même saisie que l'étape 3 de l'assistant : composant partagé **`ThresholdsEditor`** (unité, plage cible, seuils
  d'alerte, mention « à définir avec votre médecin », aperçu des 5 zones, valeurs par défaut, case « définis avec
  mon médecin »). L'assistant l'utilise aussi : une seule saisie à maintenir.
- Ouverture : `GET /me/profile` ; les seuils du serveur remplacent la copie du téléphone (message de sécurité
  hors-ligne à la saisie, L2-04). Réseau obligatoire : sans lui, message et « Réessayer ».
- **`PUT /me/profile` remplace TOUT le profil** : on renvoie le profil lu à l'identique (nom, contacts, pays, numéro
  d'urgence…) en ne changeant que l'unité, les seuils et la case (`settings.ts`, vérifié avec `patientProfileSchema`).
- « Enregistrer » n'est actif que si quelque chose a changé (valeurs comparées en mg/dL : « 0.7 » = « 0,70 ») ;
  « Annuler les modifications » revient aux valeurs enregistrées. Après l'enregistrement : unité de saisie
  (`writeUnit`) et seuils du téléphone mis à jour ; tableau de bord et chronologie les relisent en revenant.
- Les mesures déjà enregistrées ne changent jamais (mg/dL, ADR-0002) : seul leur affichage suit l'unité.
- Tests : `__tests__/settings.test.ts` (profil renvoyé complet, conversions, erreurs par seuil, profil abîmé,
  détection des changements, erreurs du serveur).

## Règle importante

Les seuils affichent « à définir avec votre médecin ». Afyabora ne donne jamais de conseil de traitement.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
