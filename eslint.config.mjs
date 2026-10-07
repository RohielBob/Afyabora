// Configuration ESLint partagée (ESLint 9, « flat config »). Ticket L0-03.
// Lancée depuis chaque package (« eslint src ») : ESLint remonte jusqu'à ce fichier.
// Non « type-aware » volontairement : plus rapide, et ne dépend pas du build des packages.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.expo/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/expo-env.d.ts',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
      'apps/api/prisma/migrations/**',
    ],
  },

  // Règles de base JavaScript, puis règles TypeScript recommandées.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Règles du projet pour tout le TypeScript.
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Un paramètre ou une variable préfixé par « _ » est volontairement inutilisé.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // CONTRIBUTING.md : pas de `any` sans commentaire justificatif.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Les tests peuvent être plus souples.
  {
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**', '**/test/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Règles des hooks React : application mobile et portail uniquement.
  {
    files: ['apps/mobile/**/*.{ts,tsx}', 'apps/portal/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Fichiers de configuration en JavaScript (Node).
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: { globals: globals.node },
  },
];
