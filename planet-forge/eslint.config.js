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
  {
    // What decides a planet's cells, heights and kinds must give identical results
    // in every browser, so it uses src/forge/detmath.ts instead of Math functions
    // that engines may round differently. Math.sqrt, floor, min, max, abs, round
    // and imul are exact and allowed.
    files: ['src/forge/**/*.ts'],
    ignores: ['src/forge/**/*.test.ts'],
    rules: {
      'no-restricted-properties': ['error',
        ...['exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'cbrt', 'hypot',
            'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
            'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh'].map((property) => ({
          object: 'Math', property,
          message: 'Not deterministic across browsers; use src/forge/detmath.ts.',
        })),
      ],
      'no-restricted-syntax': ['error',
        { selector: "BinaryExpression[operator='**']", message: 'Not deterministic across browsers; use pow from src/forge/detmath.ts.' },
        { selector: "AssignmentExpression[operator='**=']", message: 'Not deterministic across browsers; use pow from src/forge/detmath.ts.' },
      ],
    },
  },
])
