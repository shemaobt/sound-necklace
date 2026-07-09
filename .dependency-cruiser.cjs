/**
 * Direção de dependências — enforcement mecânico das fronteiras do CLAUDE.md.
 * ui → adapters → contracts → domain; domain não importa NADA de fora.
 * Interpretação registrada em docs/architecture.md: ui/app e ui/templates/ui/pages
 * formam a camada de wiring (composition root) autorizada a importar adapters.
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-nao-importa-camadas',
      severity: 'error',
      comment: 'domain/ é o núcleo congelado: nunca importa contracts/, adapters/, ui/ ou tests/.',
      from: { path: '^domain' },
      to: { path: '^(contracts|adapters|ui|tests)' },
    },
    {
      name: 'domain-puro-sem-pacotes',
      severity: 'error',
      comment:
        'domain/ compila e testa sem imports de framework/IO (código de produção; testes podem usar vitest).',
      from: { path: '^domain', pathNot: '\\.test\\.ts$' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-peer', 'npm-optional'] },
    },
    {
      name: 'contracts-so-domain',
      severity: 'error',
      comment: 'contracts/ importa apenas domain/ (e sua biblioteca de schema).',
      from: { path: '^contracts' },
      to: { path: '^(adapters|ui|tests)' },
    },
    {
      name: 'adapters-nao-importam-ui',
      severity: 'error',
      from: { path: '^adapters' },
      to: { path: '^ui' },
    },
    {
      name: 'atomos-e-moleculas-puros',
      severity: 'error',
      comment: 'ui/atoms e ui/molecules são presentacionais: props in, events out.',
      from: { path: '^ui/(atoms|molecules)' },
      to: { path: '^(domain|contracts|adapters)' },
    },
    {
      name: 'organismos-sem-adapters',
      severity: 'error',
      comment: 'Organismos consomem estado do domínio via props/hooks; nunca adapters.',
      from: { path: '^ui/organisms' },
      to: { path: '^adapters' },
    },
    {
      name: 'so-wiring-importa-adapters',
      severity: 'error',
      comment: 'Dentro de ui/, apenas pages/templates/app (camada de wiring) importam adapters.',
      from: { path: '^ui/', pathNot: '^ui/(pages|templates|app)' },
      to: { path: '^adapters' },
    },
    {
      name: 'sem-ciclos',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.(test|browser\\.test)\\.(ts|tsx)$|/fixtures/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
