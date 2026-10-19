# Héberger Afyabora (API + portail) — guide pas à pas

**Ticket L0-10.** But : une API et un portail accessibles en HTTPS depuis n'importe quel téléphone ou
ordinateur, sans que ton PC reste allumé. C'est aussi ce dont l'APK a besoin (L0-11).

| Élément                                              | Service                    | Coût                                                                                                                 |
| ---------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Base de données PostgreSQL                           | **Neon**                   | Gratuit, sans date d'expiration                                                                                      |
| API (NestJS, image Docker du dépôt)                  | **Render** (service web)   | Gratuit : **s'endort après 15 min sans visite** (premier réveil ≈ 50 s). 7 $/mois (« Starter ») : toujours éveillée. |
| Portail médecin + page publique `/e/<jeton>`         | **Render** (site statique) | Gratuit                                                                                                              |
| Emails (vérification d'adresse, mot de passe oublié) | **Brevo**                  | Gratuit, 300 emails par jour                                                                                         |

Tout est décrit dans `render.yaml` (racine du dépôt) : Render le lit et crée les deux services. **Aucun secret
n'est dans le dépôt** : tu les colles toi-même dans le tableau de bord de Render.

> **Données de démonstration uniquement** (comptes fictifs). Les offres gratuites ne sont pas prévues pour
> de vraies données de santé.

---

## 0. Avant de commencer

- Le code à héberger doit être **fusionné sur `develop`** : Render déploie la branche `develop`
  (`branch: develop` dans `render.yaml`), et redéploie tout seul à chaque fusion.
- Garde ouvert un bloc-notes **local** (pas un fichier du dépôt) pour y coller provisoirement les valeurs ;
  supprime-le à la fin.

## 1. La base de données (Neon)

1. Crée un compte sur <https://neon.tech> (connexion avec GitHub ou Google).
2. **New project** : nom `afyabora`, **PostgreSQL 16**, région **AWS Europe Central 1 (Frankfurt)**.
3. Dans **Connection details** :
   - **désactive « Connection pooling »** : il faut l'adresse **directe** (sans `-pooler` dans le nom), sinon
     les migrations de la base peuvent échouer ;
   - copie la chaîne qui commence par `postgresql://` et finit par `?sslmode=require`.
4. C'est la valeur de **`DATABASE_URL`**. Ne la mets jamais dans un fichier du dépôt.

Les tables sont créées **automatiquement** au premier démarrage de l'API (`prisma migrate deploy`, qui
n'applique que les migrations manquantes et n'efface jamais de données).

## 2. Les deux secrets de l'API

Dans PowerShell, chaque commande génère un secret et le **copie dans le presse-papiers** sans l'afficher :

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64'))" | Set-Clipboard
```

⇒ colle-le comme **`JWT_ACCESS_SECRET`** (étape 4), puis :

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" | Set-Clipboard
```

⇒ colle-le comme **`FIELD_ENCRYPTION_KEY`**.

⚠ **Ne change plus jamais `FIELD_ENCRYPTION_KEY`** une fois l'application utilisée : les notes déjà
chiffrées deviendraient illisibles. Ces deux secrets sont différents de ceux de ton `apps/api/.env` local.

## 3. Les emails (Brevo)

1. Crée un compte sur <https://www.brevo.com> (offre gratuite).
2. **Expéditeurs** (Senders) : ajoute l'adresse qui enverra les emails (ex. ton adresse Gmail) et **valide-la**
   avec le lien reçu. Sans cette validation, Brevo refuse d'envoyer.
3. **SMTP & API** ⇒ onglet **SMTP** ⇒ **Générer une clé SMTP**. Note :
   - **Identifiant** (« Login », souvent `xxxx@smtp-brevo.com`) ⇒ **`SMTP_USER`** ;
   - **Clé SMTP** ⇒ **`SMTP_PASS`** (affichée une seule fois).
4. **`SMTP_FROM`** : `Afyabora <l-adresse-validee@exemple.com>` (l'adresse validée à l'étape 2).
5. **`TEAM_NOTIFY_EMAIL`** : l'adresse de la **boîte de l'équipe** (ex. l'email Gmail du groupe), une vraie
   boîte que vous lisez. Elle reçoit les alertes « nouvelle inscription médecin », « un médecin attend votre
   vérification » et « médecin prévenu », et les réponses des médecins aux emails de décision.

> **Envoyer et recevoir, ce sont deux adresses différentes.** `SMTP_FROM` est l'expéditeur affiché : une adresse
> fournie par Brevo (`…@…brevosend.com`) peut **envoyer**, mais elle n'a pas de boîte de réception.
> `TEAM_NOTIFY_EMAIL` est l'adresse qui **reçoit** : elle doit être une vraie boîte.

Serveur et port sont déjà dans `render.yaml` (`smtp-relay.brevo.com`, **port 2525**). Pas 587 : depuis
septembre 2025, l'offre gratuite de Render **bloque les ports email 25, 465 et 587** (l'email de vérification
ne partait jamais, sans erreur visible pour l'utilisateur). Brevo accepte aussi 2525. L'API **exige une
connexion chiffrée** (STARTTLS) dès qu'un identifiant est donné : le mot de passe ne part jamais en clair.

## 4. L'API et le portail (Render)

1. Crée un compte sur <https://render.com> **avec ton compte GitHub**, et autorise l'accès au dépôt
   `RohielBob/Afyabora`.
2. **New ⇒ Blueprint** ⇒ choisis le dépôt `RohielBob/Afyabora`, branche `develop`. Render lit `render.yaml`
   et annonce deux services : `afyabora-api` et `afyabora-portail`.
3. Render demande les valeurs marquées « sync: false » : colle **`DATABASE_URL`**, **`JWT_ACCESS_SECRET`**,
   **`FIELD_ENCRYPTION_KEY`**, **`SMTP_USER`**, **`SMTP_PASS`**, **`SMTP_FROM`**, **`TEAM_NOTIFY_EMAIL`**.
   Service **déjà créé** avant l'ajout d'une variable au fichier : Render ne la demande pas ; ajoute-la dans
   **afyabora-api ⇒ Environment ⇒ Add Environment Variable**, puis **Save Changes**.
4. **Apply**. Premières constructions : l'API ≈ 10 min (image Docker), le portail ≈ 5 min.
5. **Si Render a dû choisir d'autres noms** (nom déjà pris) : les adresses changent. Corrige alors dans le
   tableau de bord :
   - service `afyabora-api` ⇒ **`PORTAL_URL`** = l'adresse réelle du portail, **`API_PUBLIC_URL`** = celle de
     l'API ;
   - service `afyabora-portail` ⇒ **`VITE_API_URL`** = l'adresse réelle de l'API, puis **Manual Deploy**
     (l'adresse est intégrée au portail au moment de la construction).

## 5. Vérifier

```powershell
curl.exe https://afyabora-api.onrender.com/health
```

Réponse attendue : `{"status":"ok", ...}`. La première fois après une veille, compte ≈ 50 s.

Puis ouvre <https://afyabora-portail.onrender.com> : la page de connexion du portail doit s'afficher.

## 6. Premiers comptes de démonstration

**Un médecin** : inscris-toi sur le portail (rôle médecin), puis clique le lien reçu par email.

La « vérification par l'équipe » ne se fait **pas par email** : un membre de l'équipe approuve (ou refuse) le
compte depuis son PC, avec l'outil `admin:doctors`, **en visant la base Neon**.

1. La boîte de l'équipe (`TEAM_NOTIFY_EMAIL`) reçoit « nouvelle inscription médecin », puis « un médecin attend
   votre vérification » avec les commandes prêtes à copier.
2. Chez Neon, copie l'adresse de connexion **directe**. Dans PowerShell, à la racine du dépôt, elle est lue
   depuis le presse-papiers **sans s'afficher** (ne la colle jamais dans une commande ni dans un message) :

```powershell
$env:DATABASE_URL = Get-Clipboard
```

```powershell
pnpm admin:doctors list
```

```powershell
pnpm admin:doctors approve adresse-du-medecin@exemple.com
```

3. **Toujours** retirer la variable à la fin (sinon les commandes suivantes visent la base hébergée) :

```powershell
Remove-Item Env:DATABASE_URL
```

4. Le médecin reçoit automatiquement l'email « compte approuvé » (ou « non validé »), envoyé par l'API dans
   la minute, et l'équipe en reçoit une copie. L'outil n'envoie rien lui-même : la clé Brevo reste chez
   Render. **API en veille** (offre gratuite) : l'email part à son réveil ; ouvre `/health` pour la réveiller.

**Des patients fictifs avec 90 jours de mesures** (facultatif). Les médecins de démonstration ne reçoivent
aucun email (ils sont approuvés directement, sans passer par l'outil) :

```powershell
$env:DATABASE_URL = Get-Clipboard
```

```powershell
pnpm db:seed
```

```powershell
Remove-Item Env:DATABASE_URL
```

> **Si l'adresse Neon a été affichée ou partagée par erreur** (discussion, capture, commande copiée) :
> Neon ⇒ **Branches** ⇒ `main` ⇒ **Roles** ⇒ ⋯ ⇒ **Reset password**, puis remplace `DATABASE_URL` dans
> Render (**Environment** ⇒ **Save Changes**).

## 7. Au quotidien

- **Chaque fusion sur `develop`** redéploie l'API et le portail ; les nouvelles migrations s'appliquent
  toutes seules au démarrage. Si une migration échoue, l'API **ne démarre pas** (l'ancienne version reste en
  ligne) : regarde les journaux (**Logs**) du service.
- **Avant une démonstration** : ouvre `/health` quelques minutes avant (réveil), ou passe le service API en
  **Starter** (Settings ⇒ Instance Type), puis reviens en gratuit après.
- **L'assistant** répond avec les phrases du moteur (`LLM_PROVIDER=none`) : aucun modèle de langage n'est
  hébergé (ADR-0005, prévu ainsi).

## 8. Sécurité

- Secrets **uniquement** dans le tableau de bord de Render ; jamais dans le dépôt, un email ou une
  discussion. En cas de fuite : régénère-le, puis **Manual Deploy** (sauf `FIELD_ENCRYPTION_KEY`, voir §2).
- L'API lit l'adresse IP réelle des visiteurs derrière le relais de Render (`TRUST_PROXY_HOPS=1`) : les
  limites de débit (ex. 10 ouvertures par minute de la carte d'urgence) s'appliquent **à chaque visiteur**,
  pas à tous ensemble. Ne mets jamais une valeur plus grande que le nombre réel de relais.
- Le portail refuse d'être affiché dans le cadre d'un autre site ; la page `/e/<jeton>` n'est jamais indexée.

## 9. Dépannage

| Problème                                                    | Cause probable                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Journaux de l'API : « Configuration invalide »              | Un secret manque ou a le mauvais format (voir le nom indiqué)                         |
| Journaux : erreur de migration ou de connexion à la base    | `DATABASE_URL` avec `-pooler`, ou sans `?sslmode=require`                             |
| Email de vérification jamais reçu                           | Expéditeur pas validé chez Brevo, ou `SMTP_FROM` ≠ adresse validée                    |
| Journaux : « Échec d'envoi de l'email… » (aucun email)      | `SMTP_PORT` à 587 : bloqué par l'offre gratuite de Render ⇒ mettre **2525**           |
| Aucune alerte dans la boîte de l'équipe                     | `TEAM_NOTIFY_EMAIL` absente du service `afyabora-api` (Environment)                   |
| `admin:doctors` : « DATABASE_URL est vide ou mal collée »   | Presse-papiers vide ou autre texte : recopier l'adresse Neon, refaire `Get-Clipboard` |
| Portail : « Le serveur ne répond pas » ou erreur CORS       | `PORTAL_URL` (API) ou `VITE_API_URL` (portail) ne correspond pas aux vraies adresses  |
| Portail : page blanche sur `/patients/…` après rechargement | Règle de réécriture absente (elle est dans `render.yaml`)                             |
