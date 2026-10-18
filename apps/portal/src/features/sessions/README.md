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

## Fait (L5-13)

- **Bandeau permanent** du dossier (`AccessBanner.tsx`, CDC F8) : « Accès valable : 04:37 » (au-delà d'une heure
  « 1:02:05 ») et « Fin de l'accès à 22:42 », collé sous l'en-tête quand on fait défiler. Les 2 dernières
  minutes : ton « attention » + sablier + « Se termine bientôt » (jamais rouge). Lecteurs d'écran : minuteur
  non relu à chaque seconde, annonce polie à 5 minutes puis à 1 minute.
- **Heure du SERVEUR** (`useCountdown.ts`, `lib/server-clock.ts`) : chaque réponse de l'API porte l'en-tête
  `Date` (exposé par CORS, `apps/api/src/main.ts`) ; le portail en déduit l'écart avec l'horloge de
  l'ordinateur. Le minuteur est recalculé chaque seconde **depuis l'heure de fin** (jamais décompté à la main)
  et au retour sur l'onglet. Vérifié avec une horloge d'ordinateur en avance de 10 minutes : écart 0 s.
- **À zéro** (ou dès qu'une réponse dit expiré, arrêté, compte non approuvé, pas votre dossier) : requêtes
  arrêtées, dossier **effacé de la mémoire**, puis l'écran **« Accès expiré »** (`routes/expired.tsx`,
  `/expired?motif=expire|arrete|compte|inaccessible`) **remplace** le dossier dans l'historique : un retour
  arrière ou un rechargement ne ramène aucune donnée (le serveur refuse de toute façon). L'écran efface aussi
  tout dossier encore en mémoire, ne montre aucune donnée du patient (pas même son prénom) et propose « Mes
  patients » et « Scanner un nouveau QR ».
- Règles pures : `countdown.ts` ; tests : `__tests__/countdown.test.tsx`.

## Règle importante

Le minuteur est indicatif : l'expiration réelle est contrôlée côté serveur à chaque requête.
