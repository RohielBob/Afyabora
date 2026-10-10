# Marque Afyabora — logo, couleurs, règles d'usage

Document provisoire (lot L7). Il décrit ce qui est **déjà appliqué dans le code** ; le designer le remplacera par la charte finale (ticket L7-04).

## Logo

- Une **goutte rouge** (dégradé) contenant un **cœur blanc** traversé d'un **tracé de pouls**.
- Le nom s'écrit en deux couleurs : « **Afya** » en bleu marine, « **bora** » en rouge corail.
- Fichiers : `docs/design/logo/afyabora-logo-reference.jpg` (image d'origine fournie par le groupe) et `docs/design/logo/afyabora-mark.svg` (goutte seule, **redessinée en vectoriel** d'après l'image).
- ⚠️ Le dessin vectoriel est une **reconstitution fidèle mais approximative** : l'image d'origine est un JPEG de ~1000 px. Pour l'impression, le store ou une version finale, **demander au créateur du logo le fichier vectoriel ou une version haute définition**.

## Couleurs (source unique : `packages/ui-tokens/src/colors.ts`)

| Nom                          | Valeur                | Rôle                                                                                      | Contraste sur blanc                  |
| ---------------------------- | --------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| Rouge goutte (`brand.red`)   | `#E4002B`             | **Couleur principale de l'interface** (ADR-0008) : boutons, liens, élément actif ; goutte | 4,8:1 (texte blanc dessus : 4,85:1)  |
| Bleu marine (`brand.navy`)   | `#0B3366`             | « Afya » ; couleur du thème d'accent « Marine »                                           | 12,5:1                               |
| Rouge corail (`brand.coral`) | `#F83E44`             | « bora », grands titres, accents                                                          | 3,6:1 — **grands textes uniquement** |
| Rouge clair / foncé          | `#FF3A4A` / `#A80024` | Extrémités du dégradé de la goutte                                                        | —                                    |

Les autres couleurs (neutres, thèmes d'accent, états glycémiques, mode sombre) sont décrites dans [`systeme-de-design.md`](systeme-de-design.md).

## Règles

1. **Rouge et blanc sont les couleurs principales** (ADR-0008, 2026-10-10) : bouton principal rouge sur fond blanc dans le thème par défaut (Clair · Rubis).
2. **Le rouge ne désigne jamais un état de santé.** Les états glycémiques ont leur propre palette sans rouge (violets, vert, ambre, orange brûlé) et sont toujours exprimés par couleur + symbole + libellé. Un test automatique le vérifie.
3. Pas de petit texte en corail (contraste insuffisant) ; utiliser `primaryText` ou `textMuted`.
4. En mode sombre, « Afya » passe en blanc cassé (le bleu marine y serait illisible).
5. Ne pas déformer la goutte (le composant `LogoMark` garde les proportions).

## Où c'est utilisé

| Élément                                              | Fichier                             |
| ---------------------------------------------------- | ----------------------------------- |
| Composants `LogoMark` et `Wordmark`                  | `apps/mobile/src/components/brand/` |
| Icône, icône adaptative, écran de lancement, favicon | `apps/mobile/assets/`               |
| Favicon du portail                                   | `apps/portal/public/favicon.svg`    |
| Palette et thèmes                                    | `packages/ui-tokens/src/colors.ts`  |
| Écran de lancement animé, écran de chargement        | `apps/mobile/src/components/brand/` |

Après toute modification de la palette, reconstruire le package : `pnpm --filter @glyka/ui-tokens build`.
