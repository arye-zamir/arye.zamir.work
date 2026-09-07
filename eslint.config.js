import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier/flat'
import perfectionist from 'eslint-plugin-perfectionist'
import vue from 'eslint-plugin-vue'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import typescriptEslint from 'typescript-eslint'

const FILE = {
  application: ['src/**/*.{ts,js,vue}'],
  browserBoundary: ['src/services/browser.ts'],
  browserJavascript: ['src/**/*.js'],
  bundledDiagramMarkup: ['src/app/architecture-diagram/ArchitectureDiagram.vue'],
  javascript: ['**/*.{js,mjs,cjs}'],
  source: ['**/*.{ts,vue}'],
}

const IGNORE = ['.vitest/', 'dist/', 'node_modules/']

export default defineConfig([
  globalIgnores(IGNORE),
  {
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
    name: 'project/linter-options',
  },
  {
    extends: [js.configs.recommended, perfectionist.configs['recommended-natural']],
    files: FILE.javascript,
    languageOptions: {
      globals: globals.node,
    },
    name: 'project/javascript',
  },
  {
    files: FILE.browserJavascript,
    languageOptions: {
      globals: globals.browser,
    },
    name: 'project/browser-javascript',
  },
  {
    extends: [
      js.configs.recommended,
      typescriptEslint.configs.strictTypeChecked,
      typescriptEslint.configs.stylisticTypeChecked,
      vue.configs['flat/recommended-error'],
      perfectionist.configs['recommended-natural'],
    ],
    files: FILE.source,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        extraFileExtensions: ['.vue'],
        parser: typescriptEslint.parser,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    name: 'project/typescript-vue',
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          fixStyle: 'inline-type-imports',
          prefer: 'type-imports',
        },
      ],
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        {
          ignoreArrowShorthand: true,
          ignoreVoidOperator: true,
        },
      ],
      '@typescript-eslint/no-meaningless-void-operator': 'off',
      'vue/block-lang': ['error', { script: { lang: 'ts' } }],
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
    },
  },
  {
    files: FILE.application,
    ignores: FILE.browserBoundary,
    name: 'project/browser-boundary',
    rules: {
      'no-restricted-globals': [
        'error',
        { message: 'Use the browser service.', name: 'window' },
        { message: 'Use the browser service.', name: 'navigator' },
        { message: 'Use the storage service.', name: 'localStorage' },
        { message: 'Use the storage service.', name: 'sessionStorage' },
      ],
      'no-restricted-properties': [
        'error',
        { message: 'Use the storage service.', object: 'globalThis', property: 'localStorage' },
        { message: 'Use the browser service.', object: 'globalThis', property: 'window' },
        { message: 'Use the browser service.', object: 'globalThis', property: 'navigator' },
      ],
    },
  },
  {
    files: FILE.bundledDiagramMarkup,
    name: 'project/bundled-diagram-markup',
    rules: {
      'vue/no-v-html': 'off',
    },
  },
  eslintConfigPrettier,
])
