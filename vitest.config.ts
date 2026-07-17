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
          // jsdom não tem MediaRecorder: o shell monta o gravador REAL por padrão
          // (ENG-298), então aqui — e SÓ aqui — ele pede o dublê. O e2e não pede: lá
          // o Chromium dá um microfone falso e o portão exige áudio de verdade.
          // VITE_API_MODE fixado: o vitest carrega .env.local como o vite, e um dev
          // com VITE_API_MODE=real não pode virar teste fazendo rede (ENG-247 DoD:
          // fixture é o default de teste/CI, mecanicamente).
          env: { VITE_VOICE: 'fixture', VITE_API_MODE: 'fixture' },
          // globals ligado para a auto-limpeza do Testing Library (afterEach cleanup);
          // sem isso, múltiplos render() no mesmo arquivo acumulam DOM e geram flakes.
          globals: true,
          // css processado: sem isto, imports de .css (mesmo ?raw/?inline)
          // viram string vazia e testes de conteúdo de token não funcionam.
          css: true,
          // init do i18n (default PT) para todo teste de UI — ENG-279.
          setupFiles: ['./ui/i18n/test-setup.ts'],
          include: ['ui/**/*.test.{ts,tsx}'],
          exclude: ['ui/**/*.browser.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'browser',
          // retry único: a 1ª execução em cache frio pode recarregar por
          // otimização de deps do Vite; as asserções não mudam.
          retry: 1,
          // mesmo escudo do projeto dom: .env.local de dev nunca vira teste com rede
          env: { VITE_API_MODE: 'fixture' },
          // init do i18n (default PT) para os testes de interação — ENG-279.
          setupFiles: ['./ui/i18n/test-setup.ts'],
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
