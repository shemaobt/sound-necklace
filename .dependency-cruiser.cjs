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
      from: { path: '^domain(/|$)' },
      to: { path: '^(contracts|adapters|ui|tests)(/|$)' },
    },
    {
      name: 'domain-puro-sem-pacotes',
      severity: 'error',
      comment:
        'domain/ compila e testa sem imports de framework/IO — nem pacotes npm, nem builtins do Node ' +
        '(o hash FNV-1a é feito à mão e roda no browser). Testes podem usar vitest.',
      from: { path: '^domain(/|$)', pathNot: '\\.test\\.ts$' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-peer', 'npm-optional', 'core'] },
    },
    {
      name: 'contracts-so-domain',
      severity: 'error',
      comment: 'contracts/ importa apenas domain/ (e zod).',
      from: { path: '^contracts(/|$)' },
      to: { path: '^(adapters|ui|tests)(/|$)' },
    },
    {
      name: 'contracts-so-zod-de-npm',
      severity: 'error',
      comment:
        'Único pacote permitido em contracts/ é zod (raiz). Qualquer outro npm/builtin é violação de camada.',
      from: { path: '^contracts(/|$)', pathNot: '\\.test\\.ts$' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-peer', 'npm-optional', 'core'],
        pathNot: 'node_modules/zod(/|$)',
      },
    },
    {
      name: 'adapters-nao-importam-ui',
      severity: 'error',
      from: { path: '^adapters(/|$)' },
      to: { path: '^ui(/|$)' },
    },
    {
      name: 'atomos-e-moleculas-puros',
      severity: 'error',
      comment: 'ui/atoms e ui/molecules são presentacionais: props in, events out.',
      from: { path: '^ui/(atoms|molecules)(/|$)' },
      to: { path: '^(domain|contracts|adapters)(/|$)' },
    },
    {
      name: 'atomos-e-moleculas-sem-i18n',
      severity: 'error',
      comment:
        'ui/atoms e ui/molecules não traduzem: a cópia chega por prop, já traduzida pelo ' +
        'organismo/página (ENG-279). A regra é própria porque ui/i18n importa domain/ — ' +
        'uma molécula que importasse i18n arrastaria o domínio junto, por caminho indireto.',
      from: { path: '^ui/(atoms|molecules)(/|$)' },
      to: { path: '^ui/i18n(/|$)' },
    },
    {
      name: 'organismos-sem-adapters',
      severity: 'error',
      comment: 'Organismos consomem estado do domínio via props/hooks; nunca adapters.',
      from: { path: '^ui/organisms(/|$)' },
      to: { path: '^adapters(/|$)' },
    },
    {
      name: 'so-wiring-importa-adapters',
      severity: 'error',
      comment: 'Dentro de ui/, apenas pages/templates/app (camada de wiring) importam adapters.',
      from: { path: '^ui/', pathNot: '^ui/(pages|templates|app)(/|$)' },
      to: { path: '^adapters(/|$)' },
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
    // Só dados de fixture ficam fora do grafo (JSON/áudio). Implementações
    // fixture em adapters/*/ SÃO módulos e permanecem sob as regras.
    exclude: { path: '^fixtures/|\\.(json|wav|webm)$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
