import js from '@eslint/js';
import globals from 'globals';

const sharedIgnores = [
  'node_modules/**',
  '.vercel/**',
  '**/*.min.js',
];

const relaxUnused = {
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  caughtErrors: 'none',
};

/** Node: Vercel serverless API, cron, scripts */
const nodeFiles = ['api/**/*.js', 'scripts/**/*.js'];

/** 브라우저에서 로드되는 스크립트 */
const browserFiles = ['app.js', 'auth.js', 'admin/**/*.js', 'store-orders/**/*.js'];

export default [
  js.configs.recommended,
  { ignores: sharedIgnores },
  {
    files: nodeFiles,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
      'no-unused-vars': ['warn', relaxUnused],
      'preserve-caught-error': 'off',
    },
  },
  {
    files: browserFiles,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        daum: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', relaxUnused],
      'preserve-caught-error': 'off',
    },
  },
];
