import globals from 'globals';
import { configs, plugins } from 'eslint-config-airbnb-extended';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/', 'dist/', 'coverage/', 'eslint.config.mjs'],
  },
  plugins.stylistic,
  plugins.importX,
  plugins.typescriptEslint,
  ...configs.base.recommended,
  ...configs.base.typescript,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        projectService: {
          allowDefaultProject: ['tests/*.test.ts'],
          defaultProject: 'tsconfig.json',
        },
      },
    },
    rules: {
      'import-x/extensions': ['error', 'ignorePackages'],
      'import-x/no-useless-path-segments': ['error', { noUselessIndex: false }],
      'class-methods-use-this': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-useless-catch': 'off',
      'import-x/extensions': 'off',
    },
  },
  prettierConfig,
];
