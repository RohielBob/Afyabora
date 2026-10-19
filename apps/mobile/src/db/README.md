# Base locale du téléphone (`src/db`)

**Lot L8 · ADR-0004 (local-first)** — tickets **L8-02 (base chiffrée, migrations) — fait** et **L8-03 (dépôts locaux) — fait**.

Tout ce que la personne saisit est écrit **d'abord sur le téléphone** (SQLite, fichier `glyka.db`), puis
envoyé au serveur par le moteur de synchronisation (L8-06). Les écrans n'appellent jamais l'API pour
écrire une mesure ou un événement.

## Règle d'or : une écriture = la donnée + son opération, dans UNE transaction

Chaque création, modification ou suppression écrit la ligne **et** une opération dans la file d'envoi
(`outbox`) dans la même transaction. Si l'une échoue, SQLite annule tout : jamais de donnée sans opération
(elle ne partirait jamais au serveur), jamais d'opération sans donnée.

## Organisation

| Fichier                             | Rôle                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `client.ts`                         | Ouvre la base **chiffrée** une fois, puis applique les migrations manquantes (`user_version`)  |
| `encryption.ts`                     | Chiffrement SQLCipher : clé, ouverture, conversion d'une base en clair, base illisible (L8-02) |
| `schema.ts`                         | Migrations versionnées. **On n'édite jamais une migration livrée : on en ajoute une.**         |
| `reset.ts`                          | Effacement à la déconnexion, nombre d'opérations en attente, compte propriétaire (L8-06)       |
| `web-memory.ts`                     | Base **en mémoire** de l'aperçu web (mêmes tables), synchronisée comme un téléphone (L8-06)    |
| `repositories/plans.ts`             | **Logique** des écritures (testée) : ligne à écrire + opération, vérifiée par `syncOpSchema`   |
| `repositories/write.ts`             | Exécution d'un plan : ligne puis opération, dans la transaction en cours                       |
| `repositories/measurements.repo.ts` | Mesures : créer, lire, lister, modifier, supprimer ; dernière mesure ; points du graphique     |
| `repositories/events.repo.ts`       | Événements (repas, activité, traitement déclaré) : créer, lire, lister, modifier, supprimer    |
| `repositories/outbox.repo.ts`       | File d'envoi : ajouter, lire, retirer, marquer en échec                                        |
| `repositories/kv.repo.ts`           | Petites valeurs du compte (seuils, curseur de synchronisation)                                 |

## Chiffrement de la base (L8-02)

- **SQLCipher** (AES-256, le moteur d'expo-sqlite avec `useSQLCipher: true` dans `app.config.ts`) : le fichier
  `glyka.db` est illisible sans la clé, même en copiant le fichier hors du téléphone.
- **Clé** : 32 octets aléatoires (`expo-crypto`), gardés dans **SecureStore** (`glyka.dbKey`, Keystore Android),
  jamais affichés ni journalisés. Créée au premier lancement, **relue** pour vérifier qu'elle est bien gardée avant
  de créer la base. Donnée à SQLCipher en clé brute (`PRAGMA key = "x'…'"`, sans dérivation lente), comme
  **première** instruction.
- **APK final** (`__DEV__` faux) : moteur sans SQLCipher ⇒ **refus** d'ouvrir la base (jamais de données de santé en
  clair). En développement (Expo Go, qui n'a pas SQLCipher) : base en clair, signalée dans Réglages ⇒ Sécurité.
- **Ancienne base en clair** (créée avant le chiffrement) : convertie au lancement, sans perte
  (`ATTACH … KEY` + `sqlcipher_export`, version recopiée), puis elle remplace l'originale. Arrêt brutal pendant la
  conversion : rattrapé au lancement suivant.
- **Base illisible** (clé perdue) : recréée vide ; la synchronisation recharge les données du serveur (seules les
  saisies jamais envoyées sont perdues). Uniquement pour l'erreur « file is not a database » : toute autre panne
  (disque…) est remontée, la base n'est **jamais** effacée pour une panne passagère.
- **Sauvegarde Android désactivée** (`allowBackup: false`) : les données ne partent pas dans Google Drive, et une base
  restaurée sans sa clé serait illisible.
- **Réglages ⇒ Sécurité** affiche l'état (« Chiffrées », « Non chiffrées » en développement, « Aperçu web »).
- Comportements de SQLCipher 4.7.0 vérifiés sur le vrai moteur (copie compilée de celui d'expo-sqlite) le 2026-10-19.

## Règles des écritures (`plans.ts`)

- Une opération **upsert** porte l'objet **complet** (le serveur applique « la dernière écriture gagne ») :
  modifier une note renvoie toute la mesure, confirmation « valeur inhabituelle » comprise.
- Toute opération est vérifiée avec **`syncOpSchema`** (`@glyka/shared`) avant d'être écrite : le téléphone
  ne met jamais en file une opération que le serveur refuserait pour son format.
- Dates stockées en **ISO UTC** (« …Z ») : comparer le texte revient à comparer les instants.
- Changer la valeur d'une mesure **annule** sa confirmation « inhabituelle », sauf si elle est redonnée.
- Une modification ou une suppression est datée (`clientUpdatedAt`) **après** la version modifiée
  (`editStamp`, L8-06) : sur un téléphone en retard, modifier une mesure tout juste reçue du serveur gagne
  quand même « la dernière écriture gagne ».
- **Suppression** = pierre tombale (`deleted_at`) + texte libre effacé (note, détails), opération `delete`
  sans payload. Supprimer deux fois ne crée pas de deuxième opération.
- Modifier une donnée absente ou supprimée : erreur `LocalNotFound` (rien n'est écrit).
- Donnée invalide : erreur `InvalidLocalWrite` (rien n'est écrit).

## Migrations

- **v1** : tables `measurements`, `events`, `outbox`, `kv`.
- **v2 (L8-03)** : `measurements.confirmed_unusual`. Sans elle, modifier une mesure confirmée renverrait
  `confirmedUnusual: false` et le serveur la refuserait. Les mesures existantes hors 20–600 mg/dL sont
  marquées confirmées (elles n'ont pu être enregistrées qu'après confirmation, L2-04).

## Tests

- `__tests__/plans.test.ts` : chaque plan (création, modification, suppression ; mesures et événements),
  opérations valides pour le serveur, payload complet, confirmation, pierres tombales, refus.
- `__tests__/reset.test.ts` : compte propriétaire des données locales (garder, attribuer, effacer).
- `__tests__/encryption.test.ts` (L8-02) : première clé, relance, conversion d'une base en clair, clé perdue,
  panne disque (rien d'effacé), refus sans SQLCipher, conversion interrompue, clé non gardée, clé abîmée.
- `__tests__/repositories.test.ts` : dépôts avec une base **simulée** qui refuse toute écriture hors
  transaction et annule tout en cas d'échec (comme SQLite) : panne pendant l'écriture de l'opération ⇒
  rien n'est gardé.
- Les migrations v1 → v2 ont été exécutées sur un vrai moteur SQLite (module `sqlite3` de Python) lors
  du ticket L8-03 ; sur téléphone, elles s'appliquent à l'ouverture de la base.
