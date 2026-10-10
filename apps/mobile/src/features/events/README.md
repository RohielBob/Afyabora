# Feature `events` — Repas, activité, traitements déclarés

**Lot L2 · Fonctionnalité F4**

Ajout rapide d'événements de vie.

## Tickets

- **L2-10** — Mobile : ajout rapide d'un repas, d'une activité, d'un traitement déclaré — **fait**

## Ajout rapide (L2-10)

Écran `app/event/new.tsx` (fenêtre qui monte du bas, comme la saisie d'une mesure), ouvert depuis
l'Historique (« + Ajouter » ; si un filtre Repas / Activité / Traitements est actif, le type est déjà choisi
via `?type=`). L'ordre de l'écran suit l'ordre de la saisie :

1. **Type** : trois tuiles (Repas, Activité, Traitement), icône + libellé, coche sur la tuile choisie. Le
   reste du formulaire apparaît une fois le type choisi.
2. **Libellé** (obligatoire, 120 caractères) avec **suggestions en un appui** : petit-déjeuner, déjeuner,
   dîner, collation ; marche, course, vélo, football, danse, ménage. Changer de type efface un libellé
   SUGGÉRÉ (« Déjeuner » n'a pas de sens pour une activité) mais garde un libellé tapé à la main.
3. **Durée** (activité) : 15 / 30 / 45 / 60 / 90 min en un appui, ou une autre durée (1–1440 minutes).
4. **Quand ?** : le même sélecteur que pour une mesure (maintenant par défaut, futur refusé).
5. **Détails / note** (facultatifs, 500 caractères).

**Traitement** : encadré « Déclaré par vous — Afyabora enregistre ce que vous indiquez, sans calculer ni
conseiller de dose ». Aucun champ de dose calculée (CDC).

Enregistrement **sur le téléphone d'abord** (L8-03 : événement + opération d'outbox dans une transaction),
puis écran de réussite (« Ajouter un autre événement » / « Terminé »). L'événement apparaît aussitôt dans
l'Historique.

| Fichier                      | Rôle                                                                  |
| ---------------------------- | --------------------------------------------------------------------- |
| `entry.ts`                   | Logique : durée, validation, données à écrire, type passé par adresse |
| `local-store.ts` / `.web.ts` | Écriture et lecture locales (SQLite) ; en mémoire dans l'aperçu web   |
| `components/TypeTiles.tsx`   | Les trois tuiles de type                                              |
| `components/QuickChips.tsx`  | Suggestions et durées en un appui                                     |
| `components/EventSaved.tsx`  | Écran de réussite animé                                               |
| `__tests__/entry.test.ts`    | Tests de la logique                                                   |

## Tests obligatoires (L2-10)

- [x] Durée : vide, 1–1440, illisible ; vérifiée seulement pour une activité.
- [x] Formulaire : type et libellé obligatoires, libellé trop long, date future refusée.
- [x] Données écrites : libellé et détails nettoyés, date ISO, durée seulement pour une activité ;
      traitement sans dose ; toujours valide pour le schéma partagé (donc le serveur).
- [x] Type passé par l'adresse : seulement les trois types connus.

## Règle importante

Traitement = déclaré par le patient, jamais de calcul de dose.

## Organisation

Une feature = un dossier autonome (composants, hooks, appels API). Elle n'importe jamais le code interne d'une autre feature : elle passe par son `index.ts`.
