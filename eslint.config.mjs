// Configuration ESLint partagée (flat config). Chaque app peut l'étendre.
// TODO(L0-03) : ajouter typescript-eslint, eslint-plugin-react-hooks (mobile/portal).
export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.expo/**', '**/coverage/**'],
  },
];
