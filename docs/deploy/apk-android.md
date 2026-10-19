# Construire l'APK Android d'Afyabora (EAS) — guide pas à pas

**Ticket L0-11.** But : un fichier **APK** à installer sur n'importe quel téléphone Android, qui parle à l'API
hébergée (`https://afyabora-api.onrender.com`, ticket L0-10). Plus besoin d'Expo Go ni du PC allumé.

| Question                 | Réponse                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Où est construit l'APK ? | Sur les serveurs d'Expo (**EAS Build**), gratuit (file d'attente : de quelques minutes à plus d'une heure)      |
| Quel profil ?            | **`preview`** : APK installable directement, adresse de l'API hébergée intégrée                                 |
| Play Store ?             | Non : distribution « interne » (lien de téléchargement). Le profil `production` sera pour plus tard             |
| Et Windows / iPhone ?    | Windows : le **portail** (navigateur). iPhone : demande un compte Apple payant, pas prévu dans le MVP           |
| Données sur le téléphone | Base locale **chiffrée** (SQLCipher, L8-02). Vérifier : Réglages ⇒ Sécurité ⇒ « Données de santé… : Chiffrées » |

Ce qui est déjà réglé dans le dépôt :

- `apps/mobile/eas.json` : profil `preview` (APK, Node 20, pnpm 9.12, `EXPO_PUBLIC_API_URL` = API hébergée).
- `apps/mobile/package.json` : `eas-build-post-install` construit `@glyka/shared`, `@glyka/analytics` et
  `@glyka/ui-tokens` sur le serveur d'Expo (leurs dossiers `dist/` ne sont pas dans Git).
- `.easignore` (racine) : ce qui n'est **jamais envoyé** à Expo (`.env`, clés, fichiers personnels comme
  `regrouper.py`, archives `.zip`…).
- `apps/mobile/app.config.ts` : propriétaire et identifiant du projet Expo (`owner`, `extra.eas.projectId`).

---

## 1. Préparer le dépôt

Toujours construire depuis `develop` à jour (l'APK contient le code **de ton dossier**, tel quel) :

```powershell
cd "E:\Users\DELL\code rohiel\glyka-repo"
```

```powershell
git switch develop
```

```powershell
git pull
```

```powershell
pnpm install
```

## 2. Se connecter à Expo (une seule fois par PC)

C'est toi qui tapes ton identifiant et ton mot de passe Expo, **jamais dans une discussion** :

```powershell
npx eas-cli@latest login
```

Vérifier :

```powershell
npx eas-cli@latest whoami
```

## 3. Lancer la construction

```powershell
cd "E:\Users\DELL\code rohiel\glyka-repo\apps\mobile"
```

```powershell
npx eas-cli@latest build --platform android --profile preview
```

Questions posées **la première fois** :

| Question                                    | Réponse                                                               |
| ------------------------------------------- | --------------------------------------------------------------------- |
| « Generate a new Android Keystore? »        | **Y** (oui). Expo crée et garde la clé de signature de l'application. |
| « Would you like to automatically create… » | Ne devrait pas apparaître (projet déjà lié). Si oui : voir Dépannage. |

Ensuite : « Compressing project files » puis « Uploading », et un lien **Build details** (page expo.dev qui
montre l'avancement). Tu peux fermer PowerShell : la construction continue chez Expo.

## 4. Installer l'APK sur un téléphone

1. À la fin, la page du build (et PowerShell, s'il est resté ouvert) affiche un **QR code** et un bouton
   **Install** / **Download**. Scanne le QR avec l'appareil photo du téléphone (ou ouvre le lien).
2. Télécharge l'APK. Android demande d'**autoriser l'installation d'applications inconnues** pour le navigateur
   (Chrome) : autorise-le pour cette fois.
3. Si **Play Protect** avertit (« application inconnue ») : **Plus de détails ⇒ Installer quand même**.
   C'est normal pour une application qui ne vient pas du Play Store.
4. Ouvre **Afyabora**. Première requête parfois lente (≈ 50 s) : l'API gratuite se réveille.

Pour donner l'APK à l'équipe : envoie le lien de la page du build (expo.dev ⇒ projet ⇒ **Builds**).

## 5. Nouvelle version

Après chaque fusion utile sur `develop` : étapes 1 et 3 à nouveau, puis installer le nouvel APK **par-dessus**
l'ancien (les données locales sont gardées, même clé de signature).

## Dépannage

| Message                                                             | Cause probable / solution                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Slug for project identified by "extra.eas.projectId"` … `glyka`    | Le projet expo.dev ne s'appelle pas `glyka` : le slug de `app.config.ts` doit être celui du projet      |
| `You don't have the required permissions to perform this operation` | Compte Expo connecté ≠ propriétaire (`owner`) du projet : `npx eas-cli@latest whoami`                   |
| Échec à l'étape « Install dependencies » (`ERR_PNPM_…`)             | `pnpm-lock.yaml` pas à jour : `pnpm install` à la racine, committer le lockfile (avec accord)           |
| Échec à « Run eas-build-post-install » (`tsup`, `@glyka/…`)         | Un paquet partagé ne se construit pas : `pnpm build` en local montre l'erreur                           |
| L'application dit « Le serveur ne répond pas »                      | API endormie (attendre 50 s) ou en panne : ouvrir `https://afyabora-api.onrender.com/health`            |
| Android refuse d'installer (« application non installée »)          | Une version signée autrement est déjà là (ex. ancienne version Expo Go / autre build) : la désinstaller |
