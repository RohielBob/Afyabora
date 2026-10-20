# Feature `scanner` — Scan du QR

**Lot L5**

Lecture du QR par la caméra du navigateur, code de secours, appel de /shares/claim.

## Tickets

- **L5-10** — Portail : scanner QR dans le navigateur + code de secours

## Fait (L5-10)

- **Page** `routes/scan.tsx` (« Scanner un QR ») : trois façons de lire le QR, même suite (`POST /shares/claim`
  puis le dossier `/patients/:sessionId`, L5-12) :
  1. **caméra** (`QrScanner.tsx`, html5-qrcode déjà installé) : allumée seulement sur « Activer la caméra »,
     éteinte dès qu'un QR est lu, à la fermeture de la page ou sur « Arrêter » ; messages clairs si la
     caméra est refusée, absente, occupée ou si l'adresse n'est pas sécurisée (https) ;
  2. **photo du QR** (fichier image), lue dans le navigateur, jamais envoyée ;
  3. **code de secours** : le code affiché sous le QR par l'application du patient (« Afficher le code de
     secours », par groupes de 4), collé ou recopié ; espaces ignorés.
- **Avant tout envoi** (`claim.ts`, `readShareToken`) : le texte doit avoir la forme d'un jeton (43
  caractères base64url) ; sinon « Ce n'est pas un QR de partage Afyabora », sans requête (le serveur bloque
  après 5 scans ratés par minute, L5-03).
- **Échecs** (`claimProblem`) : QR refusé ⇒ toujours « QR invalide ou expiré » (sans préciser) ; compte non
  approuvé ; trop de scans ratés (délai donné par le serveur) ; réseau ; serveur. Un seul envoi à la fois.
- html5-qrcode est chargé **seulement sur cette page** (import dynamique) et préparé au démarrage du
  serveur de développement (`optimizeDeps` dans `vite.config.ts`) ; la zone de la caméra reste toujours
  dans la page (jamais cachée) pour que le lecteur mesure bien la zone de lecture.
- Textes : `texts.scan` (`src/i18n/fr.ts` et ses 7 traductions). Tests : `__tests__/claim.test.ts`.
- Limite : le code de secours contient des caractères qui se ressemblent (« O » et « 0 », « l » et « I »),
  car c'est le jeton lui-même ; un code court demanderait de changer le contrat.

## Règle importante

Un QR est à usage unique et dure 60 s : afficher un message clair en cas d'échec, sans détailler la cause exacte.
