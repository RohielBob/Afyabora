# Feature `security` — Verrouillage de l'application

**Lot L1 · Fonctionnalité F1 · Ticket L1-09** (CDC F1 : « déverrouillage de l'app par biométrie ou code, en plus de la session »)

## Ce que voit la personne

- **Réglages → Sécurité** : interrupteur « Verrouiller l'application ».
  - Activer : choisir **4 ou 6 chiffres** → taper le code → le retaper. Les codes trop simples (`1234`, `0000`, `9876`…) sont refusés.
  - **Empreinte / visage** (si le téléphone en a un et qu'il est configuré) : raccourci facultatif, le code reste toujours utilisable.
  - **Reverrouiller après** : aussitôt, 1 min ou 5 min passées en arrière-plan.
  - **Changer le code** / **désactiver** : le code actuel est demandé d'abord.
- **Écran verrouillé** (au démarrage et au retour dans l'app) : par-dessus tout, **opaque dès la première image** (aucune donnée visible derrière), logo, pavé numérique, secousse en cas d'erreur, empreinte proposée tout de suite si activée.
  - Après **5 erreurs** : attente de 30 s, qui double à chaque nouvelle erreur (5 min au plus). Le compteur est enregistré : fermer l'app ne le remet pas à zéro.
  - **Code oublié ?** → se déconnecter (avec confirmation) : il faudra se reconnecter avec son mot de passe.

## Règles de sécurité

- Le code n'est **jamais stocké en clair** : empreinte SHA-256 avec un sel aléatoire de 16 octets, dans le coffre sécurisé (Keystore / Keychain).
- Comparaison de l'empreinte sur toute sa longueur.
- Le verrouillage appartient au **compte** : il est effacé à la déconnexion et quand la session expire.
- L'app attend la lecture des réglages de verrouillage avant de s'afficher (aucun écran « entre-deux »).

## Fichiers

| Fichier                       | Rôle                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `lock-rules.ts`               | Règles sans interface : code acceptable, empreinte, attente, reverrouillage, lecture des réglages |
| `app-lock.ts`                 | État partagé (`useAppLock`), démarrage, déverrouillage, réglages, retour au premier plan          |
| `lock-storage.ts` / `.web.ts` | Coffre sécurisé (téléphone) / sessionStorage (aperçu web)                                         |
| `biometrics.ts`               | Empreinte / visage (`expo-local-authentication`)                                                  |
| `components/PinPad.tsx`       | Points + pavé numérique, secousse en cas d'erreur                                                 |
| `components/LockScreen.tsx`   | Écran verrouillé                                                                                  |
| `__tests__/lock.test.ts`      | Code, empreinte, attente, reverrouillage, réglages abîmés                                         |

Écran : `app/settings/security.tsx`. Intégration : `app/_layout.tsx`. Composant partagé ajouté : `Toggle`.

## Limites connues (MVP)

- L'aperçu de l'app dans le sélecteur d'applications du téléphone n'est pas masqué (demande un module natif).
- Dans l'écran Sécurité (app déjà déverrouillée), les erreurs de code ne déclenchent pas d'attente.
