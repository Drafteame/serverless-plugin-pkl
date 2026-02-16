import globals from 'globals';
import { configs, plugins } from 'eslint-config-airbnb-extended';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/', 'build/', 'coverage/', 'eslint.config.mjs'],
  },
  plugins.stylistic,
  plugins.importX,
  ...configs.base.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
      },
    },
    rules: {
      'import-x/extensions': ['error', 'ignorePackages'],
      'import-x/no-useless-path-segments': ['error', { noUselessIndex: false }],
      'class-methods-use-this': 'off',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        before: 'readonly',
        after: 'readonly',
      },
    },
    rules: {
      'no-unused-expressions': 'off',
      'no-useless-catch': 'off',
    },
  },
  prettierConfig,
];
