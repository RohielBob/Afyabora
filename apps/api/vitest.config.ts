import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC conserve les métadonnées de décorateurs, indispensables à l'injection de dépendances NestJS.
export default defineConfig({
  test: { globals: true, root: './', include: ['test/**/*.test.ts', 'src/**/*.test.ts'] },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
