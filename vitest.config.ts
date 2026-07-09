import { playwright } from '@vitest/browser-playwright';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'domain/**/*.test.ts',
            'contracts/**/*.test.ts',
            'adapters/**/*.test.ts',
            'tests/golden/**/*.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['ui/**/*.test.{ts,tsx}'],
          exclude: ['ui/**/*.browser.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'browser',
          include: ['ui/**/*.browser.test.{ts,tsx}'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      // Cobertura POR CAMADA (CLAUDE.md gate 4): domain/ e contracts/ ≥ 90%.
      // adapters/ entra no relatório (testado contra fixtures), sem número imposto.
      // ui/ fica fora de número: os organismos críticos têm testes de interação obrigatórios.
      include: ['domain/**/*.ts', 'contracts/**/*.ts', 'adapters/**/*.ts'],
      exclude: ['**/*.test.*', '**/fixtures/**', '**/register.ts'],
      thresholds: {
        'domain/**/*.ts': { statements: 90, branches: 90, functions: 90, lines: 90 },
        'contracts/**/*.ts': { statements: 90, branches: 90, functions: 90, lines: 90 },
      },
    },
  },
});
