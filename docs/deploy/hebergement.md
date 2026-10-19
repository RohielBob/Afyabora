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

Serveur et port sont déjà dans `render.yaml` (`smtp-relay.brevo.com`, port 587). L'API **exige une
connexion chiffrée** dès qu'un identifiant est donné : le mot de passe ne part jamais en clair.

## 4. L'API et le portail (Render)

1. Crée un compte sur <https://render.com> **avec ton compte GitHub**, et autorise l'accès au dépôt
   `RohielBob/Afyabora`.
2. **New ⇒ Blueprint** ⇒ choisis le dépôt `RohielBob/Afyabora`, branche `develop`. Render lit `render.yaml`
   et annonce deux services : `afyabora-api` et `afyabora-portail`.
3. Render demande les valeurs marquées « sync: false » : colle **`DATABASE_URL`**, **`JWT_ACCESS_SECRET`**,
   **`FIELD_ENCRYPTION_KEY`**, **`SMTP_USER`**, **`SMTP_PASS`**, **`SMTP_FROM`**.
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

**Un médecin** : inscris-toi sur le portail (rôle médecin), clique le lien reçu par email, puis approuve le
compte depuis ton PC **en visant la base Neon** (la variable passe avant le fichier `.env` local) :

```powershell
$env:DATABASE_URL = "colle-ici-l-adresse-Neon"
pnpm admin:doctors list
pnpm admin:doctors approve adresse-du-medecin@exemple.com
Remove-Item Env:DATABASE_URL
```

**Des patients fictifs avec 90 jours de mesures** (facultatif) :

```powershell
$env:DATABASE_URL = "colle-ici-l-adresse-Neon"
pnpm db:seed
Remove-Item Env:DATABASE_URL
```

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

| Problème                                                    | Cause probable                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Journaux de l'API : « Configuration invalide »              | Un secret manque ou a le mauvais format (voir le nom indiqué)                        |
| Journaux : erreur de migration ou de connexion à la base    | `DATABASE_URL` avec `-pooler`, ou sans `?sslmode=require`                            |
| Email de vérification jamais reçu                           | Expéditeur pas validé chez Brevo, ou `SMTP_FROM` ≠ adresse validée                   |
| Portail : « Le serveur ne répond pas » ou erreur CORS       | `PORTAL_URL` (API) ou `VITE_API_URL` (portail) ne correspond pas aux vraies adresses |
| Portail : page blanche sur `/patients/…` après rechargement | Règle de réécriture absente (elle est dans `render.yaml`)                            |
