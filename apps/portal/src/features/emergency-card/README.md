# Feature `emergency-card` — Page publique de la carte d'urgence

**Lot L6 · Fonctionnalité F10 · Ticket L6-05**

La page qui s'ouvre quand on scanne le QR d'urgence d'un patient (`PORTAL_URL/e/<jeton>`), sur n'importe quel
téléphone, **sans compte**.

## Parcours (`routes/emergency.tsx`)

1. **Confirmation** : « Je suis un professionnel de santé ou un secouriste ». Rien n'est demandé au serveur
   avant ce clic. La page rappelle que l'ouverture est enregistrée et le patient averti, et qu'en cas de danger
   vital il faut d'abord appeler les secours.
2. **La carte** : le nom en titre, puis uniquement les champs remplis par le patient (diabète, traitement
   déclaré, allergies, groupe sanguin, dernière glycémie connue en mg/dL **et** g/L, contact d'urgence avec un
   bouton **« Appeler »**), la date de mise à jour et le rappel « pas un dispositif médical ».
3. **Problèmes** : carte indisponible (désactivée ou QR remplacé), trop d'ouvertures, service occupé, pas de
   connexion, erreur ; « Réessayer » quand cela a un sens. Adresse sans jeton valable : « Lien incomplet ».

## Règles

- Le jeton est **retiré de l'adresse** dès l'ouverture (`/e`) : il ne reste pas dans l'historique du téléphone.
- Page **jamais indexée** (balise `robots`, en plus de l'en-tête `X-Robots-Tag` de l'API).
- La réponse est vérifiée avec `emergencyCardPublicSchema` (strict) : un champ inattendu (historique…) fait
  échouer la lecture au lieu d'être affiché.
- Aucun état glycémique ni couleur d'état : la page ne juge pas la valeur, elle la montre avec sa date.

## Fichiers

- `card.ts` : lecture (`fetchEmergencyCard`), erreurs (`cardProblem`), lignes à afficher (`cardLines`),
  glycémie (`glucoseText`), lien d'appel (`telHref`), date (`updatedText`).
- `routes/emergency.tsx` : la page (`/e/:token?`, publique dans `router.tsx`).
- Textes : `texts.emergency` (`src/i18n/fr.ts` et ses 7 traductions). Tests : `__tests__/card.test.tsx`.
