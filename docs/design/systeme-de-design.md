# Système de design Afyabora

Décisions : [ADR-0008](../adr/0008-systeme-de-design.md). Jetons : `packages/ui-tokens/src/`. Composants : `apps/mobile/src/components/`. Planche de style (en développement) : **Profil → Paramètres → Planche de style** (`/settings/design`).

## 1. Règle d'or

Un écran n'utilise **que** des composants (`@/components/ui`, `@/components/brand`) et des jetons (`@/theme`). Jamais de couleur, de taille de police ni de durée d'animation écrite en dur : c'est ce qui rend l'application cohérente et permet de changer de thème sans toucher aux écrans.

## 2. Couleurs

Trois niveaux :

1. **Échelles** (`colors.ts`) : `ink` (neutres), `accentScales.rubis | framboise | marine | graphite` (nuances 50 → 950).
2. **Rôles** (`buildTheme(mode, accent).colors`) : `background`, `surface`, `surfaceMuted`, `surfaceRaised`, `border`, `borderStrong`, `text`, `textMuted`, `textSubtle`, `primary`, `primaryPressed`, `onPrimary`, `primarySoft`, `primarySoftBorder`, `primaryText`, `focus`, `overlay`, `skeleton`, `danger`, `success`, `warning`, `info`.
3. **Composants** : lisent les rôles via `const { colors } = useTheme()`.

| Rôle                    | Usage                                                             |
| ----------------------- | ----------------------------------------------------------------- |
| `primary` / `onPrimary` | Bouton principal (rouge Rubis par défaut) et son texte            |
| `primaryText`           | Liens, texte d'accent, onglet actif                               |
| `primarySoft`           | Fond d'un bouton secondaire, d'une carte teintée, d'une sélection |
| `textMuted`             | Texte secondaire (contraste AA garanti)                           |
| `textSubtle`            | Indications discrètes, **grands textes seulement**                |
| `danger`                | Erreurs de formulaire (pas un état de santé)                      |

**États glycémiques** (`theme.states`) : jamais rouges, toujours **couleur + symbole + libellé** (composant `RangeBadge`).

| État          | Symbole | Clair               | Rôle visuel     |
| ------------- | ------- | ------------------- | --------------- |
| Très bas      | ▼▼      | violet foncé, plein | le plus visible |
| En dessous    | ▼       | violet doux         |                 |
| Dans la plage | ●       | vert doux           | apaisant        |
| Au-dessus     | ▲       | ambre doux          |                 |
| Très haut     | ▲▲      | orange brûlé, plein | le plus visible |

## 3. Thèmes

Réglages → Apparence : **Clair** (défaut) / **Sombre** / **Automatique** × **Rubis** (défaut) / Framboise / Marine / Graphite. Le choix est enregistré sur le téléphone (stockage séparé des données de santé). Les 8 combinaisons passent le contrôle AA automatique.

Portail médecin : mêmes choix, dans le menu **« Apparence »** de l'en-tête (toutes les pages). Le choix est gardé dans le navigateur (`localStorage`, clé `glyka.portal.appearance`, aucune donnée patient) ; la variante `dark:` de Tailwind suit le thème choisi (`data-theme` sur `<html>`).

## 4. Typographie

Police **Plus Jakarta Sans** (chargée au démarrage). Composant `<Text variant="…" tone="…">`.

| Variante     | Taille / interligne        | Usage                                |
| ------------ | -------------------------- | ------------------------------------ |
| `display`    | 34 / 40                    | Titre d'accueil                      |
| `title`      | 26 / 32                    | Titre d'écran                        |
| `heading`    | 20 / 26                    | Titre de section                     |
| `subheading` | 17 / 24                    | Sous-titre, titre de carte           |
| `body`       | 16 / 24                    | Texte courant                        |
| `bodyStrong` | 16 / 24 (gras)             | Libellé de bouton, valeur importante |
| `bodySmall`  | 14 / 20                    | Texte secondaire                     |
| `label`      | 14 / 20 (semi-gras)        | Libellé de champ                     |
| `caption`    | 12 / 16                    | Mentions, légendes                   |
| `overline`   | 11 / 16 (MAJUSCULES)       | Surtitre de section ou de carte      |
| `metric`     | 48 / 52 (chiffres alignés) | Valeur de glycémie mise en avant     |

## 5. Espacement, formes

Grille de 4 points (`spacing.xs` 4 → `xxxl` 48). Arrondis : `radii.sm` 10 (petits), `md` 14 (champs, boutons), `lg` 18 (cartes), `pill`. Zone touchable minimale : **48 points**.

## 6. Mouvement

| Jeton               | Valeur         | Usage                                       |
| ------------------- | -------------- | ------------------------------------------- |
| `durations.fast`    | 150 ms         | Couleur, bordure de champ, coche            |
| `durations.base`    | 240 ms         | Apparition d'un élément, changement d'état  |
| `durations.slow`    | 380 ms         | Entrée d'écran                              |
| `springs.press`     | ressort ferme  | Bouton / carte qui s'enfonce (0,97 / 0,985) |
| `springs.gentle`    | ressort doux   | Pastille qui glisse, sélection              |
| `enterFromBelow(i)` | fondu + montée | Listes et cartes, décalées de 45 ms         |

Principes : **modéré** (guide le regard, ne fait jamais attendre), **cohérent** (même action = même animation), **respectueux** (réglage « réduire les animations » du téléphone respecté partout).

## 7. Composants disponibles

`Button` (primary, secondary, outline, ghost, danger ; sm/md/lg ; `loading`), `Card` (elevated, outlined, tinted ; touchable), `TextField` (libellé, aide, erreur, mot de passe), `RangeBadge`, `SegmentedControl`, `ColorSwatch`, `ListRow`, `Screen`, `Text`, `Spinner`, `LoadingDots`, `Skeleton` / `SkeletonCard`, `PressableScale` ; marque : `LogoMark`, `Wordmark`, `AnimatedSplash`, `LoadingScreen`.

## 8. Chargement

- **Lancement** : écran natif (logo sur blanc) le temps de charger la police, puis `AnimatedSplash` (≈ 1,6 s, une fois).
- **Écran entier** : `LoadingScreen` (goutte qui bat doucement + message + trois points).
- **Contenu** : `SkeletonCard` / `Skeleton` à l'emplacement exact du contenu attendu (préférer au simple indicateur).
- **Action** : `Button loading` (l'indicateur remplace le libellé, le bouton garde sa taille).
