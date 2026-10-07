# Marque Afyabora — logo, couleurs, règles d'usage

Document provisoire (lot L7). Il décrit ce qui est **déjà appliqué dans le code** ; le designer le remplacera par la charte finale (ticket L7-04).

## Logo

- Une **goutte rouge** (dégradé) contenant un **cœur blanc** traversé d'un **tracé de pouls**.
- Le nom s'écrit en deux couleurs : « **Afya** » en bleu marine, « **bora** » en rouge corail.
- Fichiers : `docs/design/logo/afyabora-logo-reference.jpg` (image d'origine fournie par le groupe) et `docs/design/logo/afyabora-mark.svg` (goutte seule, **redessinée en vectoriel** d'après l'image).
- ⚠️ Le dessin vectoriel est une **reconstitution fidèle mais approximative** : l'image d'origine est un JPEG de ~1000 px. Pour l'impression, le store ou une version finale, **demander au créateur du logo le fichier vectoriel ou une version haute définition**.

## Couleurs (source unique : `packages/ui-tokens/src/colors.ts`)

| Nom                          | Valeur                | Rôle                                                                       | Contraste sur blanc                  |
| ---------------------------- | --------------------- | -------------------------------------------------------------------------- | ------------------------------------ |
| Bleu marine (`brand.navy`)   | `#0B3366`             | Couleur principale de l'interface : boutons, liens, onglet actif, « Afya » | 12,5:1                               |
| Rouge corail (`brand.coral`) | `#F83E44`             | « bora », grands titres, accents                                           | 3,6:1 — **grands textes uniquement** |
| Rouge goutte (`brand.red`)   | `#E4002B`             | Goutte (milieu du dégradé) ; seul rouge utilisable en petit texte          | 4,8:1                                |
| Rouge clair / foncé          | `#FF3A4A` / `#A80024` | Extrémités du dégradé de la goutte                                         | —                                    |

Mode sombre : le bleu marine devient `#3E73C4` (sinon il disparaît sur fond sombre).

## Règles

1. **Le rouge de la marque ne désigne jamais un état de santé.** Les états glycémiques gardent leurs couleurs propres (`colors.state.*`) et sont toujours exprimés par couleur + symbole + libellé. Cela respecte le principe de `README.md` : « pas de rouge criard hors urgence réelle ».
2. Le bleu marine est la couleur d'action (boutons, liens). Le rouge reste réservé au logo et à de rares accents.
3. Pas de petit texte en corail (contraste insuffisant) ; utiliser le bleu marine ou le gris `textMuted`.
4. Ne pas déformer la goutte (le composant `LogoMark` garde les proportions).

## Où c'est utilisé

| Élément                                              | Fichier                             |
| ---------------------------------------------------- | ----------------------------------- |
| Composants `LogoMark` et `Wordmark`                  | `apps/mobile/src/components/brand/` |
| Icône, icône adaptative, écran de lancement, favicon | `apps/mobile/assets/`               |
| Favicon du portail                                   | `apps/portal/public/favicon.svg`    |
| Palette                                              | `packages/ui-tokens/src/colors.ts`  |

Après toute modification de la palette, reconstruire le package : `pnpm --filter @glyka/ui-tokens build`.
