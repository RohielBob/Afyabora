# Feature `legal` — Consentement et avertissement médical

**Lot L1 · Fonctionnalité F1** (cahier des charges : « consentement explicite à l'inscription (case non
pré-cochée) avec lien vers la politique de confidentialité et l'avertissement « outil d'aide, pas un
avis médical » »).

## Ticket

- **L1-10** — Mobile : consentement explicite et avertissement « outil d'aide, pas un avis médical » — **fait**

## Ce qui est en place

- **Inscription** (`app/(auth)/sign-up.tsx`) : **deux cases séparées, jamais pré-cochées** :
  1. accord pour l'enregistrement et le traitement des données de santé → lien « Lire la politique de confidentialité » ;
  2. « j'ai compris : pas de diagnostic, pas de dose, ne remplace pas un professionnel » → lien « Lire l'avertissement ».
     Chaque case a son propre message d'erreur. Le serveur reçoit `consent: true` seulement quand les **deux**
     sont cochées (**contrat d'API inchangé**, `consentAt` enregistré côté serveur depuis L1-01). Ouvrir un
     texte puis « Fermer » revient au formulaire **sans perdre la saisie**.
- **Pages** `app/legal/privacy.tsx` et `app/legal/disclaimer.tsx` : lisibles **avec ou sans compte**
  (déclarées hors des groupes protégés dans `app/_layout.tsx`). Version et date en haut, une carte par
  section (icône + titre + texte), rappel « En cas d'urgence », bouton « Fermer ».
- **`MedicalDisclaimer`** : rappel réutilisable (`card` ou `compact`), jamais rouge (carte neutre).
  Utilisé sur l'accueil, le résumé de l'assistant de profil et « À propos ».
  **À réutiliser** sur le tableau de bord (L2) et les analyses (L4), partout où l'app affiche des chiffres.
- **Paramètres → À propos** : nom, version (lue dans `app.config.ts`), avertissement, liens vers les
  deux textes, rappel d'urgence.

| Fichier                            | Rôle                                                                 |
| ---------------------------------- | -------------------------------------------------------------------- |
| `legal.ts`                         | Version des textes et ordre des sections (les textes sont dans i18n) |
| `components/LegalDocument.tsx`     | Mise en page commune des deux textes                                 |
| `components/MedicalDisclaimer.tsx` | Rappel « outil d'aide, pas un avis médical » + lien                  |
| `__tests__/legal.test.ts`          | Sections présentes en FR et EN, cases d'inscription, parité FR / EN  |

## Règles

- Les textes sont dans `src/i18n/fr.json` et `en.json` (clés `legal.*`). **Changer le sens d'un texte
  légal ⇒ monter `LEGAL_VERSION` et la date `legal.date`.**
- La politique ne décrit que ce que l'application fait **vraiment** (stockage local puis serveur, notes
  chiffrées, QR de partage à usage unique, carte d'urgence lisible sans compte, analyse sans IA par défaut).
  Si une de ces règles change, la politique change dans la même PR.
- Un test vérifie que le français et l'anglais ont **exactement les mêmes clés** (sinon l'écran
  afficherait une clé brute).

## Tests obligatoires

- [x] Inscription refusée tant que l'une des deux cases n'est pas cochée (chacune a son message).
- [x] Chaque section des deux textes existe en français et en anglais.
- [x] L'avertissement dit explicitement « ni diagnostic, ni dose ».
- [x] Parité des clés de traduction FR / EN.

## Limites connues

- Les textes sont rédigés pour un **prototype** : ils doivent être relus par l'équipe et l'encadrement
  (cadre légal local, CDC §6.3) avant toute mise à disposition du public.
- Si la politique change plus tard, on ne redemande pas encore l'accord aux comptes existants : il
  faudrait enregistrer la version acceptée côté serveur (changement de contrat, à décider en équipe).
