# Feature `emergency` — Carte d'urgence

**Lot L6 · Fonctionnalité F10**

Éditeur, QR urgence, activation, régénération, export image. L'API et la page publique du portail viennent
de L6-05.

## Tickets

- **L6-06** — Mobile : éditeur de carte d'urgence, QR urgence, export image (fait)

## Écrans

- `app/emergency/index.tsx` (onglet « Partager » ⇒ « Carte d'urgence ») :
  - **Carte active / désactivée** (icône + mot) et interrupteur. Désactivée, le QR ne montre plus rien, même
    imprimé. **Activer une carte sans QR sur ce téléphone en génère un** (choix de l'équipe). Interrupteur
    inactif tant que la carte est vide.
  - **Le QR en image** (`EmergencyQrImage`) : « CARTE D'URGENCE », « En cas d'urgence, scannez ce QR »,
    « Professionnels de santé et secouristes », le QR, « Afyabora ». **Aucun nom ni aucune donnée de santé** :
    l'image peut servir de fond d'écran ou être imprimée. Toujours noir sur blanc, même en mode sombre.
  - **« Enregistrer en image »** : PNG 1080 × 1440 confié au partage du système (galerie, WhatsApp,
    impression). Dans le navigateur, l'image est téléchargée.
  - **« Générer un nouveau QR »** avec confirmation (l'ancien cesse de marcher, copies imprimées comprises).
  - QR créé sur un autre téléphone (ou avant une réinstallation) : on l'explique, et on propose d'en générer un.
  - **« Ce que verra le secouriste »** (`CardPreview`) : seulement les champs remplis, dans l'ordre de la page
    publique ; « Modifier ma carte ».
  - « Qui a ouvert ma carte » ⇒ « Qui a consulté mes données » (chaque ouverture y est inscrite et notifiée).
  - Sans réseau : message ; le QR déjà gardé sur le téléphone reste affiché et exportable.
- `app/emergency/edit.tsx` : chaque champ est facultatif.
  - **« Reprendre mon profil »** : nom, type de diabète et contact d'urgence du profil, pour les champs encore
    vides seulement (rien n'est écrasé ni inventé).
  - **« Utiliser ma dernière mesure »** (choix de l'équipe) : la dernière glycémie du téléphone, dans l'unité
    du patient (la carte la garde en mg/dL).
  - Groupe sanguin (8 choix + « Non indiqué »), téléphone vérifié, longueurs du contrat vérifiées avant l'envoi.
  - Enregistrer ne change pas l'état « activée ».

## Fichiers

- `card.ts` : la logique, sans interface (formulaire, conversions, vérifications, propositions, aperçu, état du
  QR, `shouldGenerateQr`, erreurs).
- `api.ts` : `GET`/`PUT /emergency`, `POST /emergency/regenerate`, réponses vérifiées avec `@glyka/shared`.
- `qr-storage.ts` (+ `.web.ts`) : le **jeton du QR**, que seul le téléphone connaît (le serveur n'en garde que
  l'empreinte), en stockage **chiffré** (Keystore / Keychain), **lié au compte**, effacé à la déconnexion.
- `export-image.ts` (+ `.web.ts`) : l'image dans le cache privé puis le partage du système ; effacée à la
  déconnexion.
- `useEmergencyCard.ts` : branche tout cela sur le téléphone.
- `components/EmergencyQrImage.tsx`, `components/CardPreview.tsx`.

## Règles

- Uniquement les champs choisis par le patient ; jamais d'historique.
- L'image est dessinée en SVG et convertie en PNG par `react-native-svg` (déjà installé) : **aucune dépendance
  ajoutée**. Piège (vu en vérification) : sur le web, cette conversion remplace les guillemets par des
  apostrophes ; une apostrophe dans un attribut du dessin casse l'image. La description accessible est donc sur
  le conteneur, et l'export abandonne au bout de 10 s au lieu d'attendre sans fin.

## Tests

`__tests__/card.test.ts` ; `features/auth/__tests__/session.test.ts` (jeton et image effacés à la déconnexion).

```powershell
pnpm --filter @glyka/mobile test -- emergency session
```

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
