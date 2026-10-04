# Sécurité

Glyka manipule des données de santé. Règles non négociables :

1. **Aucune donnée de santé réelle** dans le dépôt, les issues, les captures ou la base de démo. Données fictives uniquement.
2. **Aucun secret** dans Git (`.env` ignorés ; seuls les `.env.example` sont versionnés).
3. Un secret poussé par erreur est **considéré comme compromis** : on le change, on prévient le lead technique.
4. Une faille découverte se signale en privé au lead technique, pas dans une issue publique.

La checklist de sécurité complète est dans `docs/security/checklist.md`.
