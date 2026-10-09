import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC conserve les métadonnées de décorateurs, indispensables à l'injection de dépendances NestJS.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Délai par test : 20 s au lieu de 5 s par défaut. Les fichiers de tests tournent en parallèle et ceux de
    // l'authentification font beaucoup de calculs argon2 (volontairement lents) : sur un PC chargé, le test
    // openapi-drift (qui démarre toute l'application) dépassait 5 s sans aucune erreur réelle.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
