# Contrat d'API

Le contrat **OpenAPI v0** est **gelé au jour 1** (ticket L0-07) : le mobile et le portail développent contre lui avant que l'API soit prête.

```bash
pnpm db:up
pnpm --filter @glyka/api build
pnpm --filter @glyka/api openapi:export     # génère docs/api/openapi.json
```

Swagger interactif : `http://localhost:3000/docs` quand l'API tourne.

## Règle de changement

Toute modification d'une route ou d'un schéma partagé (`packages/shared`) :

1. est annoncée dans le canal de l'équipe **avant** la fusion ;
2. met à jour `openapi.json` dans la même PR ;
3. est cochée dans la checklist de la PR.
