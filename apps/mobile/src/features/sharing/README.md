# Feature `sharing` — Partage par QR dynamique

**Lot L5 · Fonctionnalité F7**

Choix catégories/durée, QR rotatif, suivi en direct, révocation, journal d'accès.

## Tickets

- **L5-06** — Mobile : choix des catégories à partager et de la durée
- **L5-07** — Mobile : écran QR avec compte à rebours de rotation
- **L5-08** — Mobile : suivi en direct (« Dr X consulte », minuteur, bouton Mettre fin)
- **L5-09** — Mobile : écran « Qui a consulté mes données »

## Fait

### L5-06 — choix des catégories et de la durée

- **Onglet « Partager »** (`app/(tabs)/share.tsx`) : trois promesses (aucune donnée dans le QR, accès
  limité, le patient garde la main), bouton **« Partager mon historique »**, « le partage nécessite une
  connexion internet », liens vers « Qui a consulté mes données » (L5-09) et la carte d'urgence (L6-06).
- **Écran du choix** (`app/share/new.tsx`) :
  - 7 catégories en cartes cochables (icône, libellé, ce que le médecin verra). Cochées au départ :
    historique glycémique, traitements, repas, activité, résumé des analyses. **Décochées** : notes
    personnelles (CDC F7) et téléchargement du rapport. Cocher les notes affiche une mise en garde ;
  - compteur « 5 sur 7 » ; rien de coché ⇒ bouton inactif et explication ;
  - 4 durées (5 min, 30 min par défaut, 1 h, Consultation 2 h au plus) ; « la durée commence au scan » ;
  - **« Générer le QR »** ⇒ `POST /shares` puis l'écran du QR (L5-07). Sans réseau : message immédiat,
    rien n'est envoyé. 429, 503, profil manquant (message du serveur), autre erreur : message clair et
    « Réessayer » quand c'est utile.
- `choice.ts` (règles pures : ordre, cases par défaut, cocher/décocher, corps de la requête, erreurs),
  `api.ts` (`sharingApi.create`, réponse vérifiée par `createShareResponseSchema`), `flow.ts` (partage
  en cours, **en mémoire seulement** : le jeton n'est jamais écrit sur le téléphone),
  `components/CategoryOption.tsx`.
- Accessibilité : chaque carte est une case à cocher pour le lecteur d'écran (`aria-checked` ajouté : sur
  le web, `accessibilityState` ne le produit pas). Textes en français et en anglais (`share.*`).
- Tests : `__tests__/choice.test.ts`.

### L5-07 — écran du QR avec compte à rebours

- **Écran** `app/share/active.tsx` : le QR (toujours noir sur blanc, même en thème sombre), une barre et
  « Nouveau QR dans 42 s », ce qui est partagé et la durée, « Arrêter le partage ».
- **Rotation** (`rotation.ts`, contrôleur sans écran) : jeton de 60 s compté à partir de sa **réception**
  (jamais comparé à l'heure du serveur : un téléphone en avance tournerait sans fin) ; nouveau QR **10 s
  avant la fin**, donc toutes les 50 s (`GET /shares/:id/token`).
  - 409 ⇒ le QR a été scanné : plus de rotation ; l'écran montre « Dr X consulte votre dossier »,
    « Accès jusqu'à HH:MM » (`GET /shares/:id/status`) et **« Mettre fin à l'accès »** (`DELETE`).
  - 404 ⇒ partage terminé. Pas de réseau, 429, 503, autre ⇒ nouvel essai à 2 s, 4 s, 8 s puis 15 s,
    message « Connexion perdue »… avec « Réessayer » ; le QR est **masqué** dès qu'il n'est plus valable.
  - Retour dans l'application : renouvelle tout de suite si l'heure est passée. Jamais deux demandes en
    même temps ; écran fermé : plus aucune demande, réponse en route ignorée, minuterie annulée.
- Fermer avant le scan **arrête** le partage ; après le scan, fermer ne coupe pas l'accès (seul « Mettre
  fin à l'accès » le fait). Revenir sur l'écran retrouve l'état (le serveur répond 409 ⇒ « scanné »).
- `useRotatingQr.ts` branche le contrôleur sur l'écran (horloge à la seconde, retour dans l'application).
  `components/RotatingQr.tsx` dessine le QR et le compte à rebours (`react-native-qrcode-svg`, déjà
  installé).
- Tests : `__tests__/rotation.test.ts` (horloge et minuteries simulées).

### L5-08 — suivi en direct

- **Suivi** (`watch.ts`, contrôleur sans écran) : `GET /shares/:id/status` toutes les **3 s** tant que le QR
  attend (le scan se voit en 1,5 à 2 s), toutes les **10 s** pendant l'accès (un arrêt fait ailleurs se
  voit en 10 s au plus), et **pile à la fin du minuteur**. Pas de réseau : la dernière vue reste, message,
  nouvel essai à 2, 4, 8 puis 15 s. 404 ⇒ terminé. Pause en arrière-plan (aucune requête), relecture au
  retour. Minuteur : secondes restantes **données par le serveur**, comptées depuis la réception.
- **Écran** (`app/share/active.tsx`, `components/LiveAccessCard.tsx`) : « **Dr X consulte votre
  dossier** » avec l'établissement, minuteur « Expire dans 29:58 » (« 1:59:30 » au-delà d'une heure),
  « Accès jusqu'à 18:12 », **« Mettre fin à l'accès »** avec confirmation (« Couper l'accès de Dr X
  maintenant ? »). Fin : « Accès terminé » avec la raison (arrivé à son terme / vous y avez mis fin) et
  **« Créer un nouveau QR »**.
- `useShareWatch.ts` branche le suivi sur l'écran ; la rotation du QR (L5-07) s'arrête dès que le suivi
  voit le scan.
- Tests : `__tests__/watch.test.ts` (horloge et minuteries simulées).

## Reste à faire

- L5-09 : écran « Qui a consulté mes données » (journal, `GET /shares/log`).

## Règle importante

Nécessite le réseau. Le QR ne contient jamais de donnée médicale, seulement un jeton opaque.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
