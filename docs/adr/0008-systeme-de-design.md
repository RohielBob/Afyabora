# ADR-0008 — Système de design : rouge principal, thèmes préparés, animations

- **Statut :** Accepté — décision du lead technique, 2026-10-10 (tickets L7-03, L7-05)
- **Date :** 2026-10-10
- **Décideurs :** lead technique (choix proposés par Claude Code, validés un par un)

## Contexte

Le visuel compte autant que les fonctionnalités pour le PBL et la démo. Exigences exprimées : couleurs principales **rouge et blanc** (celles du logo), thèmes **clair (par défaut) / sombre / personnalisé**, **animations partout mais modérées et fluides**, écrans de chargement soignés, et un rendu qui donne l'impression d'un travail d'équipe de design (pas « improvisé »).

La charte provisoire disait l'inverse sur un point : bleu marine pour les boutons, rouge réservé au logo, parce qu'un rouge d'interface risque d'être confondu avec une alarme médicale (hypoglycémie).

## Décision

1. **Le rouge Afyabora (`#E4002B`, la goutte) est la couleur principale de l'interface** : boutons principaux, liens, éléments actifs, sur fond blanc. Le bleu marine reste la couleur de « Afya » et du thème Marine.
2. **Les états glycémiques n'utilisent jamais le rouge** : palette dédiée (bas = violets, plage = vert, haut = ambre → orange brûlé), toujours **couleur + symbole + libellé**. Un test automatique vérifie qu'aucun rouge de la marque n'y apparaît.
3. **Thèmes préparés, pas de couleur libre** : mode Clair (défaut), Sombre ou Automatique (comme le téléphone) × 4 couleurs d'accent (Rubis par défaut, Framboise, Marine, Graphite). Chaque combinaison est vérifiée automatiquement : **contraste AA** (4,5:1 pour le texte, 3:1 pour les formes).
4. **Système de jetons à trois niveaux** (`@glyka/ui-tokens`) : échelles de couleurs → rôles du thème (fond, surface, texte, action…) → composants. Aucune couleur écrite en dur dans un écran.
5. **Typographie** : une seule famille, **Plus Jakarta Sans** (Google Fonts, licence libre OFL), échelle de 11 styles.
6. **Mouvement** : `react-native-reanimated` (animations hors du fil JavaScript), 4 durées, 3 courbes, 3 ressorts. Toujours ≤ 400 ms sauf l'animation de lancement (≈ 1,6 s, une fois). Si le téléphone demande de **réduire les animations**, elles deviennent des fondus courts.
7. **Chargement** : animation de lancement (goutte, tracé de pouls qui se dessine, battement), écran de chargement « cœur au repos », squelettes à l'emplacement du contenu, indicateurs (arc, trois points).

## Alternatives étudiées

| Option                                          | Avantages                                 | Inconvénients                                                  |
| ----------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| Garder le bleu marine pour l'action             | Aucun risque de confusion avec une alarme | Le rouge de la marque est peu présent, demande non satisfaite  |
| **Rouge principal + états sans rouge (retenu)** | Identité forte, cohérente avec le logo    | Il faut une palette d'états dédiée et des tests pour la garder |
| Couleur libre choisie par le patient            | Liberté                                   | Textes illisibles possibles, rendu incohérent                  |
| Animated (intégré) au lieu de reanimated        | Aucune dépendance                         | Moins fluide (calculé sur le fil JavaScript)                   |

## Conséquences

- Nouvelles dépendances mobiles (installées avec `expo install`, compatibles SDK 54) : `react-native-reanimated` ~4.1, `react-native-worklets` 0.5.1, `expo-font` ~14, `@expo-google-fonts/plus-jakarta-sans`.
- `docs/design/marque-afyabora.md` et `docs/design/systeme-de-design.md` décrivent les règles ; `CLAUDE.md` est mis à jour.
- Les écrans provisoires (connexion, inscription) gardent temporairement les anciennes constantes `colors` (marquées obsolètes) ; ils seront refaits avec les composants en L1-06.
- La CI échoue si un contraste passe sous AA, si un état glycémique devient rouge, ou si l'échelle typographique est désordonnée (`apps/mobile/src/theme/__tests__/theme.test.ts`).
