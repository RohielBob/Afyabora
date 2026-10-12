# Scénario de démonstration (≈ 9 minutes 30)

**Préparation :** `pnpm db:seed` (Jean, Marie, Paul fictifs + Dr Demo approuvé), APK installé, portail ouvert, `scripts/sample-data/import-demo-147.csv` sur le téléphone, assistant prêt (voir « Assistant Afyabora » plus bas), **plan B** : vidéo de secours (L7-09) et version locale (Docker).

| #   | Étape                                | Ce qu'on montre                                                                                                                               | Durée    |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | **Inscription**                      | Création d'un compte, consentement, profil en 3 étapes                                                                                        | 30 s     |
| 2   | **Import**                           | `import-demo-147.csv` : **139 valides, 5 doublons, 3 incohérentes** ; correction de la ligne 42 (18,7 g/L → « vérifier l'unité ») ; import    | 1 min    |
| 3   | **Tableau de bord** (compte de Jean) | Graphique, temps dans la cible, **score de qualité 96 %**                                                                                     | 30 s     |
| 4   | **Hors-ligne**                       | **Mode avion** : saisie de 2 mesures → « 2 mesures en attente » ; retour du réseau → synchronisation automatique                              | 1 min    |
| 5   | **Notifications**                    | Rappel de mesure programmé ; alerte de seuil (texte sans valeur de santé sur l'écran verrouillé)                                              | 30 s     |
| 6   | **Analyse**                          | Tendance du soir détectée ; « Voir les mesures concernées »                                                                                   | 40 s     |
| 7   | **Assistant Afyabora**               | Carte « Une question sur vos mesures ? » ; 7 questions (voir plus bas) : mesures, fiche **relue par un médecin**, pièges refusés, urgence     | 2 min    |
| 8   | **Partage**                          | Catégories cochées, durée 5 min, QR qui tourne ; le médecin scanne depuis le portail ; dossier visible ; le patient voit « Dr Demo consulte » | 1 min 30 |
| 9   | **Révocation**                       | Le patient coupe l'accès ; le portail affiche « Accès expiré » ; **journal d'accès**                                                          | 30 s     |
| 10  | **Rapport PDF**                      | « Préparer ma consultation »                                                                                                                  | 20 s     |
| 11  | **Carte d'urgence**                  | QR urgence, champs choisis, aucun historique (si prête)                                                                                       | 30 s     |
| 12  | **Roadmap**                          | Capteurs, version commerciale, vérification des médecins                                                                                      | 30 s     |

## Assistant Afyabora (étape 7, lot L9)

**Préparation, la veille et 10 minutes avant :**

- API lancée avec le modèle local : `$env:LLM_PROVIDER = "ollama"; pnpm dev:api` (Ollama démarré, `mistral-nemo`
  installé). Poser **une question avant la démo** pour charger le modèle (la première réponse est la plus lente).
- Les 10 fiches sont **validées** (relues par un médecin le 2026-10-12) : rien à activer.
- Se connecter avec **Jean** (90 jours de mesures, soirs plus hauts) ; effacer ses anciennes conversations
  (accueil de l'assistant ⇒ « Effacer toutes mes conversations »).

**Déroulé (onglet Analyse ⇒ « Une question sur vos mesures ? » ⇒ « Nouvelle conversation »)**, dans cet ordre
(vérifié avec les données de Jean et le vrai code) :

| Question (taper ou toucher la suggestion)                 | Ce qu'on montre                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| « Comment s'est passée ma semaine ? »                     | « D'après vos mesures » : chiffres du moteur (temps dans la cible, comparaison), **aucun chiffre inventé**                      |
| « Mes glycémies du soir sont-elles hautes ? »             | Le moteur relève « des valeurs hautes plus fréquentes le soir » (même calcul que l'onglet Analyse)                              |
| « Que faire en cas d'hypoglycémie ? »                     | « D'après une fiche » ; toucher la fiche citée ⇒ lecteur : **« Relue par un médecin le 12 octobre 2026 »**, sources officielles |
| « Je suis sous metformine. » puis « Je peux l'arrêter ? » | Piège découpé en deux messages : **refus poli** (traitement), renvoi au professionnel de santé                                  |
| « Combien d'unités d'insuline dois-je prendre ? »         | **Refus** : jamais de dose                                                                                                      |
| « Je fais un malaise, que faire ? »                       | **Urgence** immédiate, sans passer par le modèle ; touche **Urgence** toujours visible en haut                                  |

À dire pendant que le modèle met en mots (« Afyabora prépare sa réponse… », 20 s à 2 min) : le modèle ne
reçoit **jamais la question**, seulement le texte déjà vérifié ; sa réponse est **revérifiée** (chiffres,
négations, mots interdits, fausse source) avant d'être affichée, sinon le texte vérifié s'affiche ; mention
« Formulé par l'IA locale, puis vérifié ».

- Jean n'a **pas de numéro d'urgence** enregistré : l'urgence dit « appelez les secours » et invite à
  l'enregistrer — Afyabora **ne devine jamais un numéro**. **Ne pas appuyer** sur une touche d'appel en démo.
- **Plan B** (modèle trop lent ou absent) : relancer l'API sans `LLM_PROVIDER` (valeur par défaut `none`) :
  mêmes réponses, prêtes tout de suite, sans mise en mots. L'image Docker de démonstration fonctionne ainsi.
- Fin : accueil de l'assistant ⇒ montrer la liste, puis **effacer** la conversation (effacement réel ; le
  médecin n'y a jamais accès).

## Comptes de démonstration

`jean@demo.glyka.local` (qualité 96 %, Bonne) · `marie@demo.glyka.local` (60 %, Partielle) · `paul@demo.glyka.local` (34 %, Insuffisante, données anciennes) · médecin `dr.demo@glyka.local`. Mot de passe : `DEMO_PASSWORD` de `apps/api/.env`.

## Points de vigilance

- Tester **chaque étape sur le matériel de la présentation** la veille.
- Avoir un téléphone chargé, un second en secours, et le hotspot de quelqu'un.
- Ne jamais montrer de vraie donnée de santé.
- Assistant : poser une première question avant la démo (chargement du modèle) ; plan B `LLM_PROVIDER=none`.
