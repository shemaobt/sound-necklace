/**
 * Dicionário PT-BR — o idioma default da UI (ENG-279). Estes valores reproduzem
 * EXATAMENTE a cópia PT-BR que já vivia hardcoded nas telas: o golden e os testes
 * de UI existentes provam byte-a-byte que nada mudou. Só o CHROME da UI passa por
 * aqui — os artefatos exportados continuam PT-BR congelados, nunca roteados pelo i18n.
 *
 * Sem `as const`: os valores ficam tipados como `string` para que `en.ts` possa
 * declarar `const en: Dict` e o typecheck exija PARIDADE de chaves (chave faltante
 * ou sobrando = erro de compilação) sem travar os textos em literais.
 */
export const pt = {
  header: {
    title: 'Colar de Sons',
    back: 'Histórias',
    backAria: 'Voltar às histórias',
    mute: 'Desligar o som da interface',
    unmute: 'Ligar o som da interface',
    switchLanguage: 'Mudar para inglês',
  },
  /** Abertura em dois painéis do protótipo Shemá v2 (ENG-278): herói cerimonial + formulário. */
  login: {
    verse: 'Assim na terra como no céu.',
    tagline:
      'Cada história contada em voz alta vira um colar de contas — ouvida, cortada e guardada aqui, com vocês.',
    privacy: 'Nada do áudio sai deste computador.',
    eyebrow: 'Entrar',
    title: 'Bem-vinda de volta.',
    subtitle: 'Continue de onde vocês pararam.',
    username: 'Usuário',
    password: 'Senha',
    submit: 'Entrar',
    busy: 'Entrando…',
    refused: 'Não foi possível entrar. Confira o usuário e a senha.',
  },
  setup: {
    eyebrow: 'Preparação',
    title: 'Nova sessão',
    trustLine:
      'Seus áudios e respostas ficam guardados com segurança no seu projeto. Só a sua equipe tem acesso.',
    aiVoiceNotice:
      'A voz do guia é sintética, gerada por IA. As perguntas são escritas por pessoas — a ferramenta não inventa conteúdo.',
    gridWarning: 'Trave o tamanho da conta antes de ancorar. Mudá-lo depois desloca as fronteiras.',
    noAudio: 'Escolha um arquivo de áudio primeiro.',
    noConsent: 'Confirme o consentimento de uso no pipeline para continuar.',
    noBeadSec: 'Não consegui definir o tamanho da conta para este áudio.',
    createFailed: 'Não foi possível criar a sessão. Tente de novo.',
    decodeError: 'Não consegui decodificar este áudio ({{detail}}). Tente um WAV PCM.',
    doorsAria: 'Como começar',
    doorZeroTitle: 'Começar do zero',
    doorZeroDesc: 'Escolher um áudio e ancorar de ouvido.',
    doorEntregaTitle: 'Confirmar uma entrega',
    doorEntregaDesc: 'Carregar propostas do projeto.',
    doorRetornoTitle: 'Retomar um retorno',
    doorRetornoDesc: 'Continuar de um retorno salvo.',
    levelPequenaTitle: 'Pequena',
    levelPequenaDesc: 'contas mais curtas',
    levelMediaTitle: 'Média',
    levelMediaDesc: 'equilíbrio',
    levelGrandeTitle: 'Grande',
    levelGrandeDesc: 'contas mais longas',
    audioHeading: 'Escolha um áudio do projeto',
    loadingAudios: 'Carregando os áudios…',
    consentOk: 'Consentimento de coleta registrado',
    consentWarn: 'Sem registro de consentimento de coleta.',
    audioReady: 'Áudio pronto',
    granHeading: 'Tamanho da conta',
    titleField: 'Título / nome curto do colar',
    titlePlaceholder: 'ex.: jesus-mienoi',
    consentCheck: 'Confirmo o consentimento de uso no pipeline do projeto.',
    creating: 'Criando…',
    create: 'Criar a sessão →',
    importEntregaHint: 'Carregue uma entrega do projeto para confirmar de ouvido.',
    importRetornoHint: 'Retome um retorno já salvo para continuar de onde parou.',
    goToImports: 'Ir para os arquivos do pipeline →',
  },
  export: {
    headline: 'A história está inteira no colar.',
    anchoringBlocked: 'Confirme o colar antes de exportar.',
    semFim: '{{n}} frase(s) ainda sem fim travado.',
    reopen: 'Destravar para editar',
    complete: 'Concluir e guardar os documentos',
  },
  imports: {
    guidanceNoSession: 'Abra uma sessão para carregar arquivos do pipeline.',
    title: 'Arquivos do pipeline',
    intro: 'Carregue uma entrega do projeto ou retome um retorno já salvo.',
    doorEntrega: 'Carregar entrega do projeto (.json)',
    doorRetorno: 'Retomar retorno salvo (.json)',
    targetEntrega: 'a entrega',
    targetRetorno: 'o retorno',
    failure: 'Não consegui ler {{alvo}} ({{detail}}).',
    deliveryOk:
      '✓ Entrega carregada: {{cenas}} cena(s), {{frases}} frase(s). As cenas são propostas — confirme de ouvido.',
    returnOk: '✓ Retomado: {{cenas}} cena(s), {{frases}} frase(s).',
  },
  /**
   * Os SEIS rótulos das estações, numa fonte ÚNICA: o fio de contas do shell e o
   * relance do dashboard leem daqui. Duplicar isto fazia o stepper dizer "Ouvir"
   * enquanto o dashboard dizia "Listen".
   */
  stations: {
    listen: 'Ouvir',
    cut: 'Cortar',
    triage: 'Triagem',
    phrases: 'Frases',
    conversation: 'Conversa',
    save: 'Guardar',
  },
  shell: {
    stepperAria: 'Progresso da sessão',
    loadingSession: 'carregando a sessão…',
    stationUnderConstruction: 'estação em construção',
    reviewLocked: '🔒 Modo de revisão — sessão em uso por {{holder}}.',
    reviewOwn: '🔒 Modo de revisão — a segmentação está travada.',
    unlock: 'Destravar para editar',
  },
  /** Momento de revisão inferido: uma manchete + um único "Continuar →". */
  review: {
    continue: 'Continuar →',
  },
  confidence: {
    certeza: 'Certeza',
    quase: 'Quase',
    duvida: 'Na dúvida',
  },
  /**
   * Cópia que vive em MOLECULES como default de prop. A molécula é presentacional: o
   * organismo/página passa o texto traduzido. Sem isto, o default PT-BR vaza para a UI
   * em EN (o botão dizia "baixado" em inglês).
   */
  documentCard: {
    download: 'Baixar',
    downloaded: 'baixado',
  },
  questionCard: {
    roleTitle: 'conduzida pela facilitadora',
  },
  progressDots: {
    dotLabel: 'ir para a cena',
  },
  stationState: {
    current: 'etapa atual',
    done: 'concluído',
    future: 'não concluído',
  },
  /** Grade Shemá v2 do dashboard (ENG-278): header próprio, cartões de história, sair. */
  dashboard: {
    logout: 'Sair',
    eyebrow: 'Arquivo oral',
    title: 'Suas histórias',
    countOne: '1 história',
    countMany: '{{count}} histórias',
    progressLabel: 'progresso: {{station}} — passo {{step}} de {{total}}',
    loading: 'Carregando as histórias…',
  },
  sessionList: {
    statusInProgress: 'Em andamento',
    statusCompleted: 'Concluída',
    editedAt: 'Editado {{when}}',
    newStoryTitle: 'Comece uma nova história',
    newStorySub: 'Carregar áudio e segmentar',
    resume: 'Retomar',
    open: 'Abrir',
    listAria: 'histórias',
  },
  escuta1: {
    tagline: 'Ouça a história.',
    reopen: 'Reabrir',
    confirm: 'Já ouvi a história completa',
  },
  escuta2: {
    title: 'Corte a história em cenas',
    reviewHeadline: 'A história está toda em cenas. Toque numa cena para reouvir.',
    instructionPre: 'Toque no colar onde ',
    instructionEmph: 'esta cena termina',
    instructionPost: '. O começo já está costurado.',
    instructionReplay: '. Toque numa cena pronta para reouvir.',
    reopen: 'Reabrir',
    back: '← Voltar',
    confirmScene: '✓ Confirmar esta cena',
    confirmAll: 'Confirmar as cenas →',
  },
  segmentacao: {
    reviewHeadline: 'As frases desta cena estão prontas.',
    instruction: 'Toque no colar o começo e o fim de cada frase.',
    reopen: 'Reabrir',
    flagMarked: '⚑ marcada',
    flagReview: '⚑ revisar',
    remove: 'Remover',
    back: '← Voltar',
    confirmPhrase: '✓ Confirmar esta frase',
    doneLast: 'Já segmentei todas as cenas →',
    doneMore: 'Pronto com esta cena →',
  },
  tutorial: {
    tips: {
      escuta1:
        'Ouçam a história inteira, sem pressa. O botão grande toca e pausa; confirme quando a história tiver sido ouvida por completo.',
      escuta2:
        'Marquem juntos onde cada cena termina e confirme uma cena de cada vez. Tocar numa cena já pronta a reproduz inteira.',
      triagem:
        'Classifiquem cada cena ouvindo-a de novo. Quando nenhum tipo se encaixa, «nenhum se encaixa» também é um achado.',
      segmentacao:
        'Dentro de cada cena, marquem as frases: um toque onde começa, outro onde termina. Se a frase passar da borda, o colar oferece caminhos.',
      mapeamento:
        'Faça as perguntas em voz alta e grave as respostas de quem conta. Você pode escrever depois — nunca pelo ouvinte.',
      export:
        'A história está inteira no colar. Guarde a sessão para gerar os documentos do projeto.',
    },
    never: 'Não mostrar de novo',
    triggerAria: 'Como funciona esta etapa',
    contentAria: 'Dica desta etapa',
    close: 'Fechar dica',
  },
  artifactCards: {
    anchoring: {
      title: 'As decisões de vocês',
      description: 'Onde cada cena e cada frase começa e termina, com o tipo e a confiança.',
    },
    manifest: {
      title: 'O mapa das contas',
      description: 'Como o áudio foi fatiado: cada conta com seu tempo. O par exato deste áudio.',
    },
    report: {
      title: 'A conversa sobre o sentido',
      description: 'O relatório editável, com as respostas em voz referenciadas por pergunta.',
    },
    saved: 'documentos salvos — nada saiu deste computador',
  },
  connectionGate: {
    offline: 'Sem conexão',
    rest: '— a edição está pausada e nada se perde. O áudio continua tocando; retomamos assim que a conexão voltar.',
  },
  guide: {
    ariaLabel: 'o guia da conversa',
  },
  triagem: {
    reviewHeadline: 'Todas as cenas classificadas.',
    empty: 'Nenhuma cena confirmada ainda.',
    instruction: 'Essa cena é sobre o quê?',
    colarHint: 'toque no colar para ouvir esta cena',
    tagNoneFit: '⌀ nenhum se encaixa',
    tagPending: '— por classificar',
    confAlta: 'certeza',
    confMedia: 'quase',
    confBaixa: 'na dúvida',
    finding:
      '⌀ Nenhum se encaixa — evidência para nomear um tipo nativo quando o padrão se repetir.',
    lockout:
      '⚠ Nenhuma cena se encaixa em Rute. Segmentação e Mapeamento ficam travadas — esta história não rende cobertura de Rute. As marcas ficam salvas como evidência de tipo nativo.',
  },
  triagemPicker: {
    // Aninhado de verdade: chaves planas com ponto só resolviam por um FALLBACK do
    // i18next (ignoreJSONStructure). Se esse default mudar, os 6 títulos de tema viram
    // a chave crua na tela — e nada quebraria.
    theme: {
      'indo-e-vindo': 'Indo e vindo',
      'fala-e-acordo': 'Fala e acordo',
      'trabalho-e-terra': 'Trabalho e terra',
      sentimento: 'Sentimento',
      'rito-e-alianca': 'Rito e aliança',
      narracao: 'Narração',
    },
    swap: 'trocar tipo',
    confidenceQuestion: 'O quanto isso parece certo pra você?',
    confirm: 'Confirmar',
    common: 'Mais comuns',
    seeAll: 'Ver todos os tipos por tema',
    collapse: 'recolher',
    noneFit: 'Nenhum se encaixa',
    filterAria: 'filtrar tipos',
    filterPlaceholder: 'filtrar…',
    groupAria: 'Tipos de cena',
  },
  coverageDrawer: {
    tabAria: 'Cobertura (facilitadora)',
    tabLabel: 'cobertura',
    title: 'Cobertura · só facilitadora',
    close: 'fechar',
    introPre: 'Cenas produtivas: ',
    introPost: '. Contagem por tipo (dado da facilitadora, escondido do ouvinte).',
    counts: 'firme {{firm}} · hesitante {{hesitant}} · alvo {{target}}',
    absence: 'Candidatos a ausência (raras em aberto)',
  },
  mapeamento: {
    listenStory: '▶ ouvir a história',
    listenScene: '▶ ouvir a cena',
    listenPhrase: '▶ ouvir a frase',
    instruction: 'Ouça o trecho e responda com calma, com a sua voz.',
    reportAria: 'relatório',
    reportFallback: 'A conversa terminou. O relatório abre aqui.',
    toExport: 'Guardar os documentos →',
    prev: '← anterior',
  },
  seamModal: {
    headline: 'A frase passou da borda da cena.',
    subline: 'Para onde vai a costura?',
    consequence: 'A cena de hoje cresce, a vizinha encolhe',
    move: 'Mover a borda até aqui',
    moveAnyway: 'Mover mesmo assim',
    backToTriagem: 'Voltar à Triagem',
    reanchor: 'Reancorar dentro da cena',
    markerBefore: 'borda de hoje',
    markerAfter: 'borda nova',
  },
  relatorio: {
    eyebrow: 'A conversa sobre o sentido',
    headline: 'Tudo que vocês falaram, reunido.',
    facilitatorLed: 'conduzida pela facilitadora',
    answerDuration: 'duração da resposta',
    answer: 'resposta',
    typedAria: 'observação da facilitadora',
    sectionStory: 'A história',
    sectionScenes: 'As cenas',
    sectionPhrases: 'As frases',
    groupScene: 'Cena {{n}}',
    groupPhrase: 'Frase {{n}}',
    playAnswer: '▶ ouvir a resposta',
    noAnswerYet: 'ainda sem resposta gravada',
    writeAnswer: 'escrever a resposta',
    addNote: 'acrescentar uma observação',
  },
  conversationStage: {
    listen: 'Ouvir a pergunta',
    record: 'gravar a resposta',
    stop: 'Parar',
    idleHint: 'Toque e fale a sua resposta',
    emptyWave: 'a sua resposta vira um fio de som aqui',
    recordingLabel: 'Gravando…',
    play: 'ouvir',
    again: 'de novo',
    typedHint: 'A facilitadora pode escrever depois — nunca por você.',
    prev: '← anterior',
    next: 'Próxima pergunta',
    progressAria: 'progresso da conversa',
  },
};

export type Dict = typeof pt;
