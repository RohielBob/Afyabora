# Feature `assistant` — conversation avec « Afyabora »

**Lot L9 · Fonctionnalité F6 · Tickets : L9-09 (L9-10 à venir)**

L'écran de conversation avec l'assistant. L'assistant répond **côté serveur** (module `assistant` de l'API :
filtre de sécurité, mesures, fiches relues par un médecin, mise en mots vérifiée par le modèle local). Le
téléphone affiche, envoie, relit — et ne garde **aucune copie** des conversations (donnée de santé, chiffrée
et effaçable sur le serveur).

## Écran (L9-09) : `app/assistant/chat.tsx`

- **Accès** : carte « Une question sur vos mesures ? » sous l'onglet Analyse (`AssistantEntryCard`). Sans
  paramètre : **nouvelle conversation** (identifiant créé sur le téléphone ; créée sur le serveur au premier
  envoi seulement). Avec `?id=` : conversation existante relue sur le serveur (la liste viendra en L9-10).
- **Accueil** (conversation vide) : Afyabora se présente — ce qu'il fait (vos mesures, des fiches relues par
  un médecin) et ce qu'il ne fera jamais (dose, diagnostic, traitement) — et propose 4 questions.
- **Réponses** : nature en **icône + libellé** (« D'après vos mesures », « D'après une fiche », « Urgence »,
  « En dehors de mon rôle », « Pas de réponse sûre ») ; fiches citées avec « Relue par un médecin » ou
  « Fiche non encore relue » ; « Formulé par l'IA locale, puis vérifié » quand le modèle l'a mise en mots.
- **Urgence** : touche « Urgence » toujours visible dans l'en-tête (panneau : appeler les secours, numéros du
  profil) ; une réponse d'urgence propose aussi les **touches d'appel** (numéro d'urgence du pays, proche,
  médecin). Seuls les numéros enregistrés par le patient : **aucun numéro n'est jamais deviné**. Le panneau
  ne passe pas par l'assistant : il reste utilisable sans réseau (numéros lus à l'ouverture).
- **Réponse en préparation** (modèle local, jusqu'à 2 minutes) : trois points animés ; relue toutes les 2 à
  5 s ; au-delà de 2 min 30, « La réponse tarde » (relue toutes les 15 s) ; annonce « Afyabora a répondu »
  aux lecteurs d'écran.
- **Hors-ligne** : la question reste affichée « Non envoyée : pas de connexion » avec **Réessayer** (même
  identifiant : le serveur ne la compte jamais deux fois) et **Retirer**. Aussi : quota (20 questions par
  heure, avec le délai), identifiant refusé (nouvel identifiant au nouvel essai), service indisponible.
  Conversation existante sans réseau : message clair et « Réessayer ».
- **Saisie** : 2 à 500 caractères (même règle que le serveur), compteur à partir de 400, une question à la
  fois.
- Avertissement « outil d'aide, pas un avis médical » en bas de la conversation ; thèmes clair et sombre ;
  animations réduites respectées.

| Fichier                          | Rôle                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `api.ts`                         | Appels `/assistant/conversations…`, réponses vérifiées par `@glyka/shared`    |
| `conversation.ts`                | État pur : réducteur, fusion des messages, erreurs, relecture, saisie         |
| `presentation.ts`                | Nature des réponses, statut des fiches, questions proposées, appels `tel:`    |
| `useConversation.ts`             | Relie l'état au réseau (création au 1er envoi, renvoi, relecture)             |
| `useEmergencyCalls.ts`           | Numéros d'urgence du profil, lus une fois                                     |
| `components/*`                   | En-tête, accueil, bulles, saisie, panneau et touches d'urgence, carte d'accès |
| `__tests__/conversation.test.ts` | Réducteur, ordre, rejeu, erreurs, saisie, relecture, retard                   |
| `__tests__/presentation.test.ts` | Icône + libellé, statut des fiches, `tel:`, aucun numéro deviné, traductions  |

## Tests obligatoires

- [x] (L9-09) Nouvelle conversation prête tout de suite, créée au premier envoi ; existante chargée (hors-ligne, introuvable, erreur).
- [x] (L9-09) Question visible « en cours », puis remplacée par la question et la réponse du serveur ; une seule à la fois.
- [x] (L9-09) Échec gardé avec sa raison (réseau, quota avec délai, identifiant pris, autre) ; nouvel essai avec le même identifiant, ou un nouveau après un 409 ; retirer.
- [x] (L9-09) Messages triés (question avant sa réponse) ; version la plus récente du serveur gardée ; réponse en préparation relue (2 s, 3 s, puis 5 s), « tarde » au-delà de 2 min 30.
- [x] (L9-09) Saisie : 2 à 500 caractères comme le serveur ; compteur à 80 %.
- [x] (L9-09) Chaque nature de réponse a une icône et un libellé traduits ; seule l'urgence en ton « danger » ; fiche relue ou non (icônes différentes).
- [x] (L9-09) Appels d'urgence : lien `tel:` propre ; ordre numéro d'urgence, proche, médecin ; aucun numéro deviné.
- [x] (L9-09) Mêmes clés de traduction en français et en anglais.
- [x] (L9-09) Vérifié dans le navigateur, format téléphone, clair et sombre, avec la vraie API et le vrai modèle local.
