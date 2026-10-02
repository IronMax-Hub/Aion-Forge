import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Planet Forge is its own app: it shares nothing with Aion Forge but the
      // Planet Spec (contracts/planet-spec/), which it reads as data
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/frontend', '**/frontend/**', '**/backend', '**/backend/**'], message: 'Planet Forge must not import Aion Forge code; only the Planet Spec is shared.' }],
      }],
    },
  },
])
