# infra/

Tout ce qui sert à faire tourner Glyka en local ou en intégration.

| Fichier                 | Rôle                                                                         |
| ----------------------- | ---------------------------------------------------------------------------- |
| `../docker-compose.yml` | PostgreSQL + Mailpit (emails de dev) ; profil `full` pour lancer aussi l'API |
| `docker/api.Dockerfile` | Image de l'API                                                               |

**Responsable : Lot L0 (Socle).**
Les workflows CI sont dans `.github/workflows/`.
