# ADR-0003 — QR dynamique : jetons opaques, rotatifs, à usage unique

- **Statut :** Proposé
- **Date :** 2026-10-04

## Contexte

Le guide exige un QR qui change régulièrement ou après utilisation, avec une durée de validité définissable. Le patient doit contrôler ce qui est partagé et pouvoir couper l'accès.

## Décision

- Le QR contient un **jeton aléatoire opaque** (≥ 32 octets), jamais de donnée médicale.
- Le serveur ne stocke que le **hash SHA-256** du jeton.
- Le jeton **tourne toutes les 60 s** et est **à usage unique** (consommation atomique).
- Le médecin doit être **connecté et approuvé**. Le scan crée un accès rattaché à ce médecin, dont la durée (`expiresAt`) démarre au scan.
- Les catégories partagées sont filtrées **côté serveur**. L'expiration est vérifiée à **chaque requête** avec l'horloge du serveur.
- Chaque étape est écrite dans un **journal d'accès** visible par le patient. Le patient peut **révoquer** immédiatement.

## Menaces et limites assumées

| Menace                            | Réponse                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Capture d'écran du QR             | Expire en 60 s, usage unique, et il faut un compte médecin approuvé            |
| Rejeu d'un jeton                  | Usage unique + hash seul en base                                               |
| Deux scans simultanés             | Consommation atomique : un seul gagne                                          |
| Médecin qui garde la page ouverte | Chaque requête revérifie l'expiration ; les données disparaissent à l'écran    |
| Compte médecin frauduleux         | MVP : approbation manuelle ; V2 : vérification auprès de l'ordre professionnel |

## Conséquences

Le partage nécessite le réseau. Les tests de sécurité du lot L5 (ticket L5-14) sont obligatoires.
