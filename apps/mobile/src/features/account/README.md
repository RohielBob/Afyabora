# Mes données et mon compte (`features/account`)

**Ticket L1-14 (mobile) · F1 · RGPD : droit d'accès (export) et droit à l'effacement (suppression).**
L'API est faite depuis L1-14 API (`GET /me/export`, `DELETE /me`, voir `apps/api/src/modules/patients/README.md`).

Écran : **Réglages ⇒ Mes données et mon compte** (`app/settings/account.tsx`).

## Exporter mes données

- Un fichier **JSON** préparé par le serveur : profil, mesures, événements, notes déchiffrées
  (`afyabora-export-AAAA-MM-JJ.json`). Le nom proposé par le serveur n'est gardé que s'il est sûr
  (lettres, chiffres, `- _ .`, finit par `.json`, sans `..`) ; sinon nom local daté.
- **Réseau obligatoire** : sans lui, message tout de suite, rien n'est demandé.
- Les saisies **pas encore envoyées partent d'abord** (sinon elles manqueraient) ; celles qui n'ont pas pu
  partir sont annoncées (« 1 saisie n'a pas pu être envoyée : elle n'est pas dans ce fichier »).
- Une réponse qui n'est pas un export (pas d'objet avec `exportedAt`) est une erreur : rien n'est rangé.
- Le fichier est rangé dans le **cache privé** (`exports/`, un seul à la fois) puis confié au **partage du
  système** (Fichiers, Drive, e-mail…). Il est effacé à la déconnexion et à la suppression du compte : des
  données de santé en clair ne traînent pas sur le téléphone. L'écran le rappelle.
- Erreurs expliquées : hors-ligne, trop d'exports (429), profil pas encore créé (404), partage indisponible
  (le fichier est quand même prêt), autre.

## Supprimer mon compte

- En **deux temps** : explication de ce qui sera effacé (profil, mesures, événements, partages : les médecins
  perdent l'accès tout de suite, carte d'urgence : le QR ne s'ouvre plus, données du téléphone), puis
  **mot de passe** + case « je comprends » ; le bouton « Supprimer définitivement » n'est actif qu'avec les deux.
- `deleteAccount` (`features/auth/session.ts`) : moteur de synchronisation **arrêté avant** (un envoi après la
  suppression recevrait 401 et fermerait la session comme « expirée »), puis `DELETE /me`.
  - **Refus** (mot de passe faux 403 `INVALID_PASSWORD`, trop d'essais 429, hors-ligne) : **rien n'est
    supprimé**, la synchronisation reprend, le mot de passe saisi est vidé.
  - **Réussite** : base locale, rapport PDF, export JSON, QR d'urgence et jetons effacés (comme à la
    déconnexion, sans « dernier envoi » : le compte n'existe plus), session fermée avec la raison `deleted` ;
    l'accueil affiche « Compte supprimé ». Le verrouillage par code est effacé lui aussi (`app/_layout.tsx`).

## Organisation

| Fichier                | Rôle                                                                      |
| ---------------------- | ------------------------------------------------------------------------- |
| `account.ts`           | **Logique** (testée) : export, nom du fichier, erreurs, règle du bouton   |
| `files.ts` / `.web.ts` | Rangement et partage du fichier (téléphone) / téléchargement (aperçu web) |
| `useAccountExport.ts`  | Branche l'export sur le réseau, la synchronisation, l'API et le partage   |

## Tests

- `__tests__/account.test.ts` : export (cas normal, hors-ligne, envoi d'abord, envoi incomplet, erreurs du
  serveur, réponse invalide, partage indisponible), nom du fichier, erreurs de suppression, bouton.
- `features/auth/__tests__/session.test.ts` : suppression réussie (ordre, tout effacé, raison `deleted`), mot
  de passe refusé (rien d'effacé, synchronisation relancée), hors-ligne ; export effacé à la déconnexion.
