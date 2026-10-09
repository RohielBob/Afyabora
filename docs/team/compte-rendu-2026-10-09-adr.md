# Compte rendu — Réunion du 09/10/2026 (validation des ADR, tickets L0-09 et L8-01)

**Présents :** l'équipe (noms à compléter) · **Absents :** … · **Rédigé par :** lead technique, avec Claude Code

Support de réunion : `docs/team/reunion-adr-L0-09.md` et les propositions issues de l'audit du dépôt (section « Points relevés par l'audit » de ce même fichier).

## Décisions prises

| #   | Décision                                                                                                             | Justification                                                       | Impact                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | ADR-0001 accepté, avec l'exception React 18.3.1 documentée pour l'API (PDF côté serveur)                             | L'exception existe déjà et ne casse rien (installée à part)         | Aucune montée de dépendance pendant le MVP             |
| 2   | ADR-0002 accepté tel quel                                                                                            | Code déjà conforme (18,016 ; 20–600 mg/dL ; seuils identiques)      | Seuils à faire relire par un professionnel si possible |
| 3   | ADR-0003 accepté tel quel                                                                                            | Base de données déjà prête pour les jetons hachés                   | Lot L5 = chemin critique ; tests de sécurité L5-14     |
| 4   | ADR-0004 accepté **avec 8 modifications** (L8-01)                                                                    | Points relevés à l'audit : lot de synchro, dates UTC, multi-compte… | Chaque point est rattaché à un ticket (voir l'ADR)     |
| 5   | ADR-0005 accepté ; MVP sans fournisseur de LLM (`LLM_PROVIDER=none`, gabarits)                                       | La démo ne dépend d'aucune API externe                              | `LlmProvider` reste une option                         |
| 6   | ADR-0006 accepté ; texte d'exemple corrigé « Glyka » → « Afyabora »                                                  | Conformité avec l'ADR-0007 (nom visible = Afyabora)                 | Aucun                                                  |
| 7   | L1-01 : lien de vérification vers le portail, jeton valable 24 h, inscription médecin incluse, pas de nouvelle route | Propositions de l'audit acceptées                                   | Une page portail `/verify-email` est à créer (ticket)  |

## Points discutés

- L0-01 mis en pause par manque de temps (à reprendre à la fin). Constat : la protection de branche est **impossible** sur un dépôt privé avec un compte GitHub gratuit (erreur 403) ; labels et 10 jalons J1–J10 sont bien en place.
- Identifiant Android/iOS `com.glyka.app` : à trancher **avant le premier build EAS** (L0-11).

## Actions (reportées dans `plan-d-action.md`)

| Action                                                 | Responsable        | Échéance              |
| ------------------------------------------------------ | ------------------ | --------------------- |
| Compléter les noms des présents dans ce compte rendu   | Lead               | Avant fusion de la PR |
| Implémenter L1-01 (inscription + vérification d'email) | Lead + Claude Code | J2                    |
| Créer le ticket « portail : page /verify-email »       | Lead               | J2                    |
| Décider `com.glyka.app` ou `com.afyabora.app`          | Équipe             | Avant L0-11           |

## Prochaine réunion

Point quotidien (voir `docs/team/rituels.md`).
