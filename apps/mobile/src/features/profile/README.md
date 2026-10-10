# Feature `profile` — Profil médical et paramètres de santé

**Lot L1 · Fonctionnalité F1**

Assistant de profil, unité préférée, plage cible et seuils, contacts.

## Tickets

- **L1-05** — API : profil patient et seuils d'alerte (validation Zod) — **fait**
- **L1-08** — Mobile : assistant de profil — **fait** (4 étapes + résumé, décision du 2026-10-10)

## Assistant (`app/(onboarding)/profile-setup.tsx`)

| Étape              | Contenu                                                                                                                     | Obligatoire                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1. Qui êtes-vous ? | prénom, nom, date de naissance (JJ/MM/AAAA, « / » ajoutés pendant la frappe), sexe                                          | oui                                 |
| 2. Votre diabète   | type (1, 2, gestationnel, autre), année du diagnostic                                                                       | type : oui ; année : non            |
| 3. Unité et seuils | unité (g/L par défaut, mg/dL, mmol/L), plage cible (de / à), seuils très bas / très haut, case « définis avec mon médecin » | oui (valeurs par défaut proposées)  |
| 4. Vos contacts    | un proche (nom, téléphone, lien) ; le médecin traitant (nom, téléphone)                                                     | non, mais complet s'il est commencé |
| Résumé             | une carte par étape avec « Modifier », puis « Enregistrer mon profil »                                                      | —                                   |

- **On ne passe à l'étape suivante que si elle est valide.** La validation utilise le schéma du serveur (`patientProfileSchema`, `@glyka/shared`) : on ne garde que les erreurs des champs de l'étape. Message sous chaque champ (i18n `onboarding.errors.*`).
- **Seuils** : saisis dans l'unité choisie (virgule ou point), envoyés en **mg/dL entiers** (ADR-0002). Changer d'unité convertit les valeurs affichées. Mention « à définir avec votre médecin », bouton « Revenir aux valeurs par défaut », barre colorée des 5 zones (couleurs des états, jamais rouge, symbole dans chaque zone).
- **Fin** : `PUT /me/profile`, écran « Bienvenue », puis `markProfileCompleted()` (session, L1-07) et ouverture des onglets.
- Animations : étape qui glisse (droite = suivant, gauche = retour), barre de progression, écran qui remonte en haut à chaque étape (`Screen scrollKey`).
- Traitement, allergies, groupe sanguin : **carte d'urgence** (L6-06), pas dans le profil.

## Fichiers

| Fichier                       | Rôle                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `wizard.ts`                   | Logique sans interface : brouillon, conversions d'unités, dates, validation par étape, requête finale |
| `api.ts`                      | `GET` / `PUT /me/profile`                                                                             |
| `components/StepProgress.tsx` | « Étape 2 sur 4 », barre animée, titre                                                                |
| `components/ThresholdBar.tsx` | Aperçu des 5 zones de glycémie                                                                        |
| `__tests__/wizard.test.ts`    | Unités, dates, validation de chaque étape, requête finale                                             |

Composant partagé ajouté : `ChoiceGroup` (`src/components/ui`), choix unique en pastilles.

## Règle importante

Les seuils affichent « à définir avec votre médecin ». Afyabora ne donne jamais de conseil de traitement.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
