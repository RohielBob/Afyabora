# Feature `sync` — Synchronisation hors-ligne

**Lot L8 · Fonctionnalité F11 · ADR-0004**

Outbox, push, pull, connectivité, état affiché à l'utilisateur.

## Tickets

- **L8-06** — Moteur de synchronisation mobile : push par lots, pull, reprise avec délai croissant — **fait**
- **L8-07** — Détection de connectivité et déclencheurs (retour réseau, ouverture, tirer pour rafraîchir)
- **L8-08** — Coalescence de l'outbox (fonction pure + tests) — fait (`coalesce.ts`)
- **L8-09** — Tests de conflits et d'idempotence : rejeu, doublon, suppression hors-ligne, dérive d'horloge
- **L8-10** — Interface : « n mesures en attente », état de synchronisation, erreurs
- **L8-17** — Test hors-ligne de bout en bout sur un vrai téléphone (mode avion)

## Fichiers

| Fichier                     | Rôle                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `engine.ts`                 | Le moteur : cycle, verrou, nouvel essai avec délai croissant, état publié. Ne connaît ni SQLite ni le réseau        |
| `rules.ts`                  | Décisions **pures** (testées) : lot à envoyer, réglage des réponses, données reçues, délais                         |
| `coalesce.ts`               | Coalescence de la file d'envoi (L8-08)                                                                              |
| `sqlite-store.ts`           | Base du moteur sur **téléphone** (tables `outbox`, `measurements`, `events`, `kv` ; aucune migration)               |
| `memory-store.ts`           | Base du moteur pour l'**aperçu web** (base en mémoire `db/web-memory.ts`), mêmes décisions                          |
| `store.ts` / `store.web.ts` | Choix de la base selon la plateforme                                                                                |
| `service.ts`                | LE moteur de l'application, branché sur la vraie base et la vraie API (réponses vérifiées par les schémas partagés) |
| `connectivity.ts`           | Détection du réseau (L8-07)                                                                                         |

Les écrans et les autres features passent par `index.ts` : `requestSync`, `syncAfterLocalWrite`, `syncNow`,
`stopSync`, `onSyncedData`, `useSyncState`.

## Le cycle (`engine.ts`)

1. **Un seul cycle à la fois.** Une demande pendant un cycle en relance un juste après. Sans session : rien.
2. **Envoi** : la file d'envoi par lots de 200, coalescée (pour une même donnée, seule la dernière opération
   part : elle porte l'objet complet ou la suppression), `POST /sync/push`.
   - `APPLIED`, `DUPLICATE`, `CONFLICT_SERVER_WINS` ⇒ opération retirée de la file (et les plus anciennes de
     la même donnée) ; la donnée n'est plus « en attente » s'il ne reste rien pour elle. Une saisie faite
     **pendant** l'envoi reste en attente et part juste après.
   - `REJECTED` ⇒ gardée avec sa raison (`last_error`), **plus renvoyée** (elle serait refusée à nouveau),
     sans bloquer les autres. Une modification suivante de la même donnée la remplace. L8-10 l'affichera.
   - Opération sans réponse du serveur ⇒ gardée, nouvel essai plus tard.
3. **Réception** : `GET /sync/pull` depuis le curseur gardé, page après page. Chaque page est appliquée
   (données **et** suppressions) **puis** le curseur enregistré, dans **une** transaction : une coupure au
   milieu fait relire la page, jamais la sauter. Rien n'est remis dans la file d'envoi. Curseur refusé (400)
   ⇒ on repart du début, une fois. 20 lots et 50 pages au plus par cycle : la suite part au cycle suivant.
4. **État publié** (`useSyncState`) : `idle | syncing | offline | error`, en attente, refusées, dernière
   synchronisation réussie, code d'erreur (`offline`, `server`, `session`, `refused`, `local`), prochain essai.

**Échecs** : réseau coupé, serveur en panne (5xx), trop de requêtes (429), réponse illisible, base locale en
erreur ⇒ rien n'est perdu, nouvel essai à 2 s, 4 s, 8 s… jusqu'à 5 minutes ; remis à 2 s après un succès.
Session expirée (401) ⇒ arrêt, sans nouvel essai.

## Données reçues : qui gagne ?

| Donnée reçue         | Sur le téléphone        | Décision                                                                |
| -------------------- | ----------------------- | ----------------------------------------------------------------------- |
| Modifiée ou nouvelle | Rien en attente         | Enregistrée (le serveur a la version de référence)                      |
| **Supprimée**        | Modification en attente | Supprimée **et** opération retirée : une suppression est définitive     |
| Modifiée             | Modification en attente | Gardée telle quelle : elle part au prochain envoi et le serveur tranche |

Si le serveur garde sa version (`CONFLICT_SERVER_WINS`), le téléphone **remet son curseur à zéro** : tout est
relu (de façon idempotente) et la version du serveur revient, même si le téléphone l'avait déjà vue. C'est
rare (deux appareils, horloges très décalées) ; le contrat ne donne pas `clientUpdatedAt` dans les données
reçues, ni de route « une mesure par identifiant » : relire tout est la seule façon sûre.

Pour que ce cas reste rare, une modification ou une suppression faite sur le téléphone porte une date
**toujours postérieure** à la version modifiée (`editStamp`, `db/repositories/plans.ts`) : sur un téléphone
en retard de quelques minutes, modifier une mesure tout juste importée gagne quand même.

Une mesure reçue hors 20–600 mg/dL est marquée « confirmée » (le serveur ne l'accepte que confirmée) : la
modifier ensuite (sa note par exemple) ne sera pas refusée.

## Déclencheurs (L8-06)

- **Après une saisie** (mesure créée, modifiée, supprimée ; événement créé) : 3 s plus tard, les saisies
  rapprochées partent ensemble.
- **Fin d'un import** et **annulation d'un import** : tout de suite (les mesures arrivent dans l'Historique).
- **Connexion** : tout de suite (nouveau téléphone : tout le compte arrive).
- L'Historique et l'Accueil se rechargent quand la réception change des données (`onSyncedData`).
- L8-07 ajoutera : retour du réseau, ouverture de l'application, « tirer pour rafraîchir ».

## Comptes (ADR-0004, modifications 3 et 6)

- **Déconnexion** : dernier essai d'envoi (5 s au plus) tant que la session est valide, puis `stopSync()`
  (plus aucune écriture du moteur, même d'un cycle en vol), puis effacement de la base.
- **Connexion** : la base locale est rattachée au compte (`claimLocalData`, clé `kv.local_owner`). Même compte
  après une session expirée ⇒ tout est gardé, file d'envoi comprise. **Autre compte** ⇒ tout est effacé
  avant : ses modifications non envoyées ne partent jamais sur le compte qui se connecte.

## Tests

- `__tests__/rules.test.ts` : délais, lot coalescé et valide pour le serveur, réglage des réponses, données
  reçues (UTC, confirmation, date qui ne recule pas), décisions.
- `__tests__/engine.test.ts` : le moteur avec la base en mémoire et un **serveur simulé** aux mêmes règles que
  l'API (`fake-server.ts`) : envoi, coalescence, refus, rejeu sans doublon, saisie pendant l'envoi, première
  synchronisation par pages, suppressions, modification en attente, conflit, téléphone en retard, curseur
  refusé, beaucoup de pages, réseau coupé puis revenu, 503, 401, réponse illisible, base en erreur, délais
  jusqu'à 5 min, un seul cycle à la fois, regroupement des saisies, déconnexion pendant un cycle.
- Vérifié sur un **vrai moteur SQLite** (module `sqlite3` de Python) : vrais dépôts + `sqlite-store.ts` +
  moteur, toutes les requêtes exécutées (envoi coalescé, refus gardé, `pending_sync`, réception par pages,
  confirmation à 990 mg/dL, suppressions, modification en attente, curseur remis à zéro).
- Vérifié de bout en bout (vraie API, vraie base, application web) : import de 141 mesures sur le serveur ⇒
  reçues en 1,5 s après la connexion et affichées dans l'Historique (badge « Import ») ; saisie envoyée 4 s
  après ; hors-ligne ⇒ gardée, envoyée 3,4 s après le retour du réseau ; annulation de l'import ⇒ 141
  suppressions reçues, plus aucune mesure importée affichée.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
