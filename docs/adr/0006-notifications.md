# ADR-0006 — Notifications : locales d'abord, push serveur ensuite, sans valeur de santé par défaut

- **Statut :** Proposé
- **Date :** 2026-10-04

## Contexte

Les notifications sont une exigence validée du MVP : rappels de mesure, alertes de seuil, activité de partage. Elles doivent fonctionner même sans réseau.

## Décision

- **Notifications locales** (`expo-notifications`, planifiées sur le téléphone) pour : rappels de mesure programmables, alerte de seuil franchi, « pas de mesure depuis X heures ». Elles marchent **hors-ligne**.
- **Push serveur** (Expo Push) pour les événements côté serveur : un médecin consulte / l'accès se termine, la carte d'urgence est ouverte, un import est terminé. Jeton d'appareil enregistré via `POST /devices` ; file `NotificationOutbox` traitée par une tâche planifiée.
- **Confidentialité :** par défaut, **aucune valeur de santé** dans le texte (« Nouvelle alerte Glyka — ouvrez l'app »). Option explicite pour l'afficher sur l'écran verrouillé.
- Préférences par catégorie et **heures calmes**.

## Conséquences

- Le push Android exige un **development build** (pas Expo Go) et la configuration de Firebase Cloud Messaging (ticket L0-11).
- Les alertes locales réutilisent `@glyka/analytics` sur le téléphone.
- En cas de retard, le **push serveur (L8-16)** est coupé avant les notifications locales (L8-12, L8-13).
