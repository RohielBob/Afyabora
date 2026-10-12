# Fiches de connaissances de l'assistant « Afyabora »

Ticket **L9-02** (lot L9, complément de l'ADR-0005 du 2026-10-11). L'assistant ne répond aux questions générales
sur le diabète **qu'à partir de ces fiches**, et les cite. Il ne fait jamais de diagnostic, ne donne aucune dose
et ne modifie aucun traitement.

> **Statut actuel : les 10 fiches sont VALIDÉES** (version 1). Rédigées avec Claude Code à partir des sources
> publiques citées, elles ont été **relues et approuvées en entier par un médecin le 2026-10-12**. Le médecin a
> demandé à **rester anonyme** : les fiches indiquent `relu_par: Médecin relecteur (anonyme)` ; son identité est
> connue du lead technique et n'est écrite nulle part dans le dépôt. L'empreinte de chaque fiche prouve que le
> texte servi est exactement celui qui a été relu. En production, l'assistant n'utilise que les fiches validées ;
> une fiche modifiée repasse en brouillon (« Fiche non encore relue ») jusqu'à une nouvelle relecture.

## Les fiches

| Fichier                               | Sujet                                    | Statut               |
| ------------------------------------- | ---------------------------------------- | -------------------- |
| `fiches/hypoglycemie.md`              | Reconnaître une hypoglycémie et réagir   | validée (2026-10-12) |
| `fiches/hyperglycemie.md`             | Glycémie trop haute, quand réagir vite   | validée (2026-10-12) |
| `fiches/hba1c.md`                     | L'hémoglobine glyquée                    | validée (2026-10-12) |
| `fiches/lire-ses-glycemies.md`        | Unités, plage cible, temps dans la cible | validée (2026-10-12) |
| `fiches/alimentation.md`              | Repères d'alimentation                   | validée (2026-10-12) |
| `fiches/activite-physique.md`         | Bouger, combien, quelles précautions     | validée (2026-10-12) |
| `fiches/sommeil.md`                   | Sommeil, hypoglycémies nocturnes, apnée  | validée (2026-10-12) |
| `fiches/stress.md`                    | Stress, moral, fatigue liée au diabète   | validée (2026-10-12) |
| `fiches/preparer-une-consultation.md` | Préparer un rendez-vous                  | validée (2026-10-12) |
| `fiches/quand-demander-de-l-aide.md`  | Urgences et situations à signaler        | validée (2026-10-12) |

## Format d'une fiche

Un fichier Markdown : un **en-tête** entre deux lignes `---`, puis le **texte**.

```text
---
id: hypoglycemie                       ← le nom du fichier, sans « .md »
titre: Hypoglycémie : la reconnaître et réagir
resume: Une phrase affichée dans la liste des fiches.
statut: brouillon                      ← « brouillon » ou « validee »
version: 1                             ← à augmenter à chaque changement de contenu
relu_par:                              ← vide pour un brouillon ; « Dr … » une fois validée
relu_le:                               ← vide pour un brouillon ; date AAAA-MM-JJ une fois validée
empreinte:                             ← vide pour un brouillon ; voir « Valider une fiche »
mots_cles: hypo, sucre bas, malaise, … ← au moins 5, séparés par des virgules (recherche de l'assistant)
sources:
  - Libellé de la source | https://adresse-officielle
---

## Première partie

Texte…
```

Règles vérifiées automatiquement (`apps/api/test/assistant-knowledge.test.ts`) ; une seule fiche fautive empêche
l'API de démarrer :

- tous les champs de l'en-tête sont présents, sans champ inconnu ni en double ;
- au moins une source en `https://`, uniquement des sites officiels reconnus (Fédération Française des
  Diabétiques, HAS, OMS, American Diabetes Association, DOI d'articles scientifiques) ;
- texte de 600 à 4 000 caractères, en au moins deux parties `##` ;
- Markdown simple seulement : titres `##`, paragraphes, listes `-`, `**gras**` ; aucun lien dans le texte ;
- renvoi au médecin ou au professionnel de santé ;
- **jamais** : nom commercial de médicament, dose (unités, mg, posologie), consigne de modifier un traitement,
  numéro de téléphone (le numéro d'urgence vient du profil du patient), promesse de guérison, diagnostic
  affirmé (« vous avez une … »).

Le dossier `fiches/` est exclu de Prettier (`.prettierignore`) : le texte relu par le médecin ne doit jamais être
reformaté automatiquement.

## Valider une fiche (médecin relecteur)

1. Le médecin relit la fiche **en entier** (titre, résumé, texte et sources) et demande les corrections.
2. Une fois le texte final accepté, mettre `statut: validee`, `relu_par: Dr Prénom Nom` et
   `relu_le: AAAA-MM-JJ`, en laissant `empreinte:` vide. **Si le médecin demande l'anonymat**, écrire
   `relu_par: Médecin relecteur (anonyme)` : ce champ est montré aux patients (`reviewedBy`), son nom ne doit
   alors apparaître nulle part (ni fiche, ni commit, ni PR) ; le lead technique garde son identité.
3. Lancer le test des fiches :

   ```powershell
   pnpm --filter @glyka/api exec vitest run assistant-knowledge
   ```

   Il échoue et affiche « empreinte à recopier après la relecture : « empreinte: … » » : recopier cette
   valeur dans `empreinte:`.

4. Relancer le test : il passe. L'empreinte prouve que le texte servi aux patients est **exactement** celui qui
   a été relu.

## Modifier une fiche déjà validée

Toute modification du titre, du résumé, des sources ou du texte change l'empreinte : le test refuse alors la
fiche. Il faut la repasser en `statut: brouillon`, vider `relu_par`, `relu_le` et `empreinte`, augmenter
`version`, puis la faire relire de nouveau. Seuls les `mots_cles` peuvent changer sans nouvelle relecture : ils
servent à la recherche et ne sont jamais montrés au patient.
