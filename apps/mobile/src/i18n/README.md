# Langues de l'application (`src/i18n`)

Tous les textes visibles sont ici, un fichier par langue : **jamais de texte écrit en dur dans un écran**.
Le **français** (`fr.json`) est la langue de référence : chaque texte y est écrit d'abord, et une clé absente
d'une traduction s'affiche en français (jamais vide).

| Langue    | Fichier    | Relue par une personne qui parle la langue                                    |
| --------- | ---------- | ----------------------------------------------------------------------------- |
| Français  | `fr.json`  | oui (référence)                                                               |
| English   | `en.json`  | oui                                                                           |
| Español   | `es.json`  | **non** : « traduction en relecture »                                         |
| Português | `pt.json`  | **non** : « traduction en relecture » (portugais d'Europe, celui de l'Angola) |
| Lingála   | `ln.json`  | **non** : « traduction en relecture »                                         |
| Kiswahili | `sw.json`  | **non** : « traduction en relecture »                                         |
| Kikongo   | `kg.json`  | **non** : « traduction en relecture » (à relire en priorité)                  |
| Tshiluba  | `lua.json` | **non** : « traduction en relecture » (à relire en priorité)                  |

## Langues de la RD Congo : choix faits (à valider à la relecture)

- **Lingala** : celui de Kinshasa, en orthographe courante **sans `ɛ`/`ɔ`** (lettres absentes de la police
  de l'application ; c'est aussi l'écriture des SMS et des affiches). Tutoiement « yo ». Les mots que tout le
  monde dit en français restent en français : compte, serveur, adresse, diabète, unité, internet.
- **Kiswahili** : swahili standard (celui de l'école et des médias), compris dans l'Est du pays.
- **Kikongo** : kikongo ya leta (kituba), la forme véhiculaire de la RD Congo. Tutoiement « nge ».
- **Tshiluba** : ciluba du Kasaï (code `lua`). Tutoiement « wewe », possessif « webe ».
- Kikongo et tshiluba ont été traduits avec **moins de références** que les autres : à relire en priorité,
  en particulier les messages de santé (liste ci-dessous).

## Choix de la langue (Réglages ⇒ Langue, aussi depuis l'accueil sans compte)

- **« Langue du téléphone »** (par défaut) : la première langue du téléphone que l'application connaît, sinon le
  français (`languages.ts`, testé). Une langue choisie gagne sur celle du téléphone.
- Le choix est gardé sur le téléphone (`language-storage.ts`, fichier clé/valeur séparé des données de santé) :
  la déconnexion ne le change pas. Le changement est immédiat (tous les écrans se redessinent).
- Dates et nombres suivent la langue : `toLocaleDateString(formatLocale(i18n.language))`. Le moteur des dates ne
  connaît ni le kikongo ni le tshiluba : `formatLocale` (`languages.ts`, testé) écrit alors dates et nombres **en
  français**, et non dans la langue par défaut de l'appareil (souvent l'anglais).

## Ce qui reste en français (pour l'instant)

Le contenu produit par le **serveur** : réponses et fiches de l'assistant, rapport PDF, emails. L'assistant ne
comprend que le français : ses 4 questions proposées restent en français dans toutes les langues (une question
traduite ne serait pas comprise), et un bandeau le dit (`assistant.frenchOnly`). Les traduire demande de changer
le contrat d'API (ticket à part).

## Ajouter une langue

1. Copier `fr.json` en `<code>.json` et tout traduire (les clés ne changent jamais).
2. Garder **toutes les `{{variables}}`** telles quelles (ex. `{{count}}`, `{{name}}`), à n'importe quelle place.
3. **Pluriels** : `_one` (1), `_other` (le reste), `_many` (forme du français, de l'espagnol, du portugais pour
   1 000 000 : recopier `_other`), `_zero` quand le français en a une. Ajouter les formes propres à la langue si
   ses règles en demandent d'autres (le test le signale).
4. Dans les écrans, toujours `formatLocale(i18n.language)` pour les dates et nombres, jamais `i18n.language` seul.
5. L'ajouter dans `languages.ts` (`code`, nom écrit dans sa propre langue, `reviewed: false`) et dans `index.ts`.
6. `pnpm --filter @glyka/mobile test` : `__tests__/languages.test.ts` vérifie mêmes clés que le français, mêmes
   variables, pluriels pour 0, 1, 2, 5, 21, 100 et 1 000 000, aucun texte vide ni caractère invisible ; et
   `features/emergency/__tests__/image-text.test.ts` vérifie que les textes de l'image d'urgence tiennent.

## Relecture d'une langue

Une personne qui parle la langue relit **tout** le fichier, en priorité les messages de santé : `glucose`,
`safety`, `measurement.safety`, `measurement.unusual`, `legal`, `emergency`, `onboarding.thresholds`, `insights`.
Ensuite seulement, passer `reviewed: true` dans `languages.ts` (la mention « traduction en relecture »
disparaît), dans une PR qui indique qui a relu.
