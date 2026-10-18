# Feature `sessions` — Patients partagés

**Lot L5**

Liste des sessions de partage (actives et expirées), compte à rebours.

## Tickets

- **L5-11** — Portail : liste des patients partagés (statut, dernière donnée, qualité)
- **L5-13** — Portail : bandeau de compte à rebours et écran « Accès expiré »

## Fait (L5-11)

- Page **« Mes patients partagés »** (`routes/patients.tsx`, `GET /doctor/sessions`) : accès en cours d'abord,
  puis terminés (grisés, sans bouton). Pour chaque patient (`SessionCard.tsx`, règles dans `view.ts`) :
  prénom et type de diabète, état en icône + texte (« Accès en cours », « Accès expiré », « Arrêté par le
  patient »), **heure de fin donnée par le serveur** (« jusqu'à 18:12 » : l'horloge de l'ordinateur ne peut
  pas la fausser), ce qui est partagé, dernière mesure, qualité (barres + texte + score), « Ouvrir le
  dossier » (L5-12).
- Relue à chaque ouverture de la page, toutes les 30 s et au retour sur l'onglet : un accès arrêté par le
  patient apparaît terminé sans recharger. Vide, réseau coupé, erreur : expliqués.
- Tests : `__tests__/view.test.tsx`.

## Fichiers prévus

- `useCountdown.ts` : fondé sur l'heure du SERVEUR (L5-13)

## Règle importante

Le minuteur est indicatif : l'expiration réelle est contrôlée côté serveur à chaque requête.
