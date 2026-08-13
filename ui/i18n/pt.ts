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
    soundMenu: 'som e volume',
    storyVolume: 'volume da história',
    unmute: 'Ligar o som da interface',
    settings: 'Configurações',
    // o rótulo diz o DESTINO, não o estado: quem ouve o leitor de tela precisa
    // saber o que o clique faz; o ícone (lua/sol) já diz a mesma coisa por olho
    themeToDark: 'Mudar para o tema escuro',
    themeToLight: 'Mudar para o tema claro',
  },
  autosave: {
    saving: 'Salvando…',
    saved: 'Tudo salvo — pode sair e voltar',
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
  settings: {
    eyebrow: 'Projeto',
    title: 'Configurações',
    lead: 'Valem para o projeto inteiro, fora da criação das histórias.',
    loading: 'Carregando…',
    readError: 'Não foi possível ler as configurações do projeto. Recarregue a página.',
    langHeading: 'Idioma da interface',
    langLead:
      'Muda só os textos da ferramenta. O áudio, os nomes das histórias e as decisões de vocês não mudam.',
    langPtName: 'Português',
    langPtRegion: 'Brasil',
    langEnName: 'English',
    langEnRegion: 'Global',
    granEyebrow: 'Granularidade do cordão',
    granTitle: 'De que tamanho serão as contas deste cordão?',
    granLead:
      'A conta é o menor pedaço do áudio — a unidade de todo corte do projeto. Escolha o tamanho: ele vale para todas as histórias e não muda depois.',
    granTitleConfirmed: 'As contas deste cordão já têm tamanho.',
    granLeadConfirmed:
      'Foi escolhido para o projeto inteiro e não muda mais. Mudá-lo agora mudaria a referência de tudo o que já foi cortado e exportado.',
    granConfirm: 'Confirmar — isto não muda depois',
    granConfirming: 'Confirmando…',
    granAskAdmin: 'Peça a quem administra o projeto para escolher o tamanho da conta.',
    granForbidden: 'Só quem administra o projeto pode escolher o tamanho da conta.',
    granAlreadyConfirmed: 'O tamanho da conta deste projeto já foi confirmado e não muda mais.',
    granSaveError: 'Não foi possível confirmar. Tente de novo.',
    sampleDensity_one: 'Neste tamanho, {{seconds}} segundos desta história viram 1 conta.',
    sampleDensity_other:
      'Neste tamanho, {{seconds}} segundos desta história viram {{count}} contas.',
    samplePlay: '▶ ouvir esta amostra',
    sampleStop: '⏸ parar',
    sampleLoading: 'carregando o áudio…',
    sampleError: 'Não deu para tocar a amostra agora. A escolha do tamanho não depende dela.',
    level: {
      small: 'Pequeno',
      medium: 'Médio',
      large: 'Grande',
    },
    levelDesc: {
      small: 'Contas curtas, corte mais fino. Serve a histórias densas, em que cada palavra pesa.',
      medium:
        'O equilíbrio recomendado entre precisão e leveza. Serve à grande maioria das histórias.',
      large: 'Contas longas, cordão mais leve. Serve a histórias corridas, de fôlego largo.',
    },
  },
  setup: {
    eyebrow: 'Preparação',
    title: 'Nova sessão',
    disclosure:
      'Áudio e respostas ficam no seu projeto. A voz do guia é sintética; as perguntas são escritas por pessoas.',
    gridWarning: 'Trave o tamanho da conta antes de ancorar. Mudá-lo depois desloca as fronteiras.',
    noAudio: 'Escolha um arquivo de áudio primeiro.',
    bucketError: 'Não foi possível carregar os áudios do projeto. Recarregue a página.',
    noConsent: 'Confirme o consentimento de uso no pipeline para continuar.',
    noBeadSec: 'Não consegui definir o tamanho da conta para este áudio.',
    createFailed: 'Não foi possível criar a sessão. Tente de novo.',
    decodeError: 'Não consegui decodificar este áudio ({{detail}}). Tente um WAV PCM.',
    levelPequenaTitle: 'Pequena',
    levelPequenaDesc: 'contas mais curtas',
    levelMediaTitle: 'Média',
    levelMediaDesc: 'equilíbrio',
    levelGrandeTitle: 'Grande',
    levelGrandeDesc: 'contas mais longas',
    audioHeading: 'Escolha um áudio do projeto',
    loadingAudios: 'Carregando os áudios…',
    consentOk: 'Consentimento de coleta registrado',
    consentOkShort: '✓ consentimento',
    consentWarn: 'Sem registro de consentimento de coleta.',
    consentWarnShort: 'sem consentimento',
    audioReady: 'Áudio pronto',
    granFromProject: 'Definido para o projeto inteiro. Todos os áudios cortam nesta grade.',
    granUnset: 'Este projeto ainda não tem um tamanho de conta definido.',
    granReadError: 'Não foi possível ler o tamanho da conta do projeto. Recarregue a página.',
    /* A trava de granularidade (ENG-363): cópia do protótipo do dono,
       docs/design/trava-granularidade.html. */
    lock: {
      eyebrow: 'Granularidade do cordão',
      title: 'De que tamanho serão as contas deste cordão?',
      body: 'A conta é o menor pedaço do áudio — a unidade de todo corte do projeto. Ela vale para todas as histórias e não muda depois. Escolha antes de criar a primeira sessão.',
      primary: 'Definir o tamanho da conta',
      secondary: 'Voltar ao painel',
      titleMember: 'As contas deste projeto ainda não têm tamanho.',
      bodyMember:
        'Peça a quem administra o projeto para escolher o tamanho da conta. As sessões só começam depois disso.',
      primaryMember: 'Voltar ao painel',
    },
    granMismatch:
      'Este áudio cairia numa grade diferente da do resto do projeto. Cortá-lo aqui partiria o projeto em dois sistemas de coordenadas — fale com quem cuida do pipeline antes de seguir.',
    granHeading: 'Tamanho da conta',
    titleField: 'Título / nome curto do colar',
    titlePlaceholder: 'ex.: jesus-mienoi',
    consentCheck: 'Confirmo o consentimento de uso no pipeline do projeto.',
    creating: 'Criando…',
    create: 'Criar a sessão →',
  },
  export: {
    headline: 'A história está inteira no colar.',
    waitEyebrow: 'Guardando',
    waitLine: 'Reunindo as decisões de vocês nos documentos…',
    anchoringBlocked: 'Confirme o colar antes de exportar.',
    /* Os dois títulos da recusa. Um gate que recusa não é uma falha: dizer "falta um
       passo" nomeia o que fazer, enquanto "não consegui" nomeia o que deu errado.
       Trocá-los faz a facilitadora procurar conexão quando o que falta é um clique. */
    noticeBlocked: 'Falta um passo.',
    noticeFailed: 'Não consegui agora.',
    reportBlocked_one:
      'Ainda há 1 resposta gravada sem o texto em inglês confirmado. Confirme-a no relatório — ou escreva a resposta à mão.',
    reportBlocked_other:
      'Ainda há {{count}} respostas gravadas sem o texto em inglês confirmado. Confirme cada uma no relatório — ou escreva a resposta à mão.',
    reportBlockedUnknown:
      'Não consegui conferir quais respostas foram gravadas. Recarregue a página antes de guardar.',
    semFim: '{{n}} frase(s) ainda sem fim travado.',
    netTimeLabel: 'Tempo de trabalho nesta sessão',
    netTimeHm: '{{h}} h {{m}} min',
    netTimeM: '{{m}} min',
    netTimeShort: 'menos de 1 min',
    reopen: 'Destravar para editar',
    complete: 'Concluir e guardar os documentos',
    saving: 'Guardando…',
    saveError: 'Não consegui guardar agora. Verifique a conexão e tente de novo.',
    reopenError: 'Não consegui destravar agora. Tente de novo.',
    downloadError: 'Não consegui baixar o documento. Tente de novo.',
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
    preparingEyebrow: 'Um momento',
    preparingSession: 'Preparando o colar da sua história…',
    stationUnderConstruction: 'estação em construção',
    reviewLocked: '🔒 Modo de revisão — sessão em uso por {{holder}}.',
    /** Perdemos contato com o servidor: guia, não pune — o trabalho salvo está a salvo. */
    reviewStale: '🔒 Modo de revisão — reconectando à sessão…',
    reviewOtherTab: '🔒 Modo de revisão — esta história está aberta em outra aba.',
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
    /* Único rótulo com dígito no app (ENG-389): o indicador da triagem numera a
       cena porque, sem número, era lido como uma conta do colar. Em toda outra
       superfície "Cena N" vai por extenso (`cut.sceneLabel` + `sceneOrdinal`). */
    sceneDot: 'Cena {{n}}',
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
    /* O menu do cartão nomeia a história: duas sessões na grade dão dois gatilhos,
       e "Ações" sozinho não diz em qual deles se está (ENG-281). */
    actions: 'Ações em {{story}}',
    downloads: 'Baixar os documentos',
    renameSession: 'Renomear a história',
    deleteSession: 'Apagar a história',
    renameDialog: {
      title: 'Renomear “{{story}}”',
      /* O nome de exibição muda; o slug não (§10.6) — e o slug é o que nomeia os
         três documentos. Dizer isso evita a facilitadora esperar que os arquivos
         já guardados sigam o nome novo. */
      body: 'Muda só o nome que aparece aqui. Os documentos continuam com o nome de arquivo de sempre.',
      field: 'Nome da história',
      save: 'Salvar o nome',
      cancel: 'Cancelar',
      locked:
        '{{holder}} está com esta história aberta agora. O nome não pode mudar enquanto isso.',
      failed: 'Não consegui renomear a história. Verifique a conexão e tente de novo.',
    },
    deleteConfirm: {
      title: 'Apagar “{{story}}”?',
      /* A pergunta diz o que vai junto: é um apagamento definitivo no servidor, e
         quem confirma precisa poder perceber que pegou o cartão errado (§9.4). */
      body: 'Some tudo desta história: os cortes, as classificações e as gravações de voz das respostas. Não dá para desfazer.',
      confirm: 'Apagar para sempre',
      cancel: 'Manter a história',
      locked:
        '{{holder}} está com esta história aberta agora. Ela não pode ser apagada enquanto isso.',
      failed: 'Não consegui apagar a história. Verifique a conexão e tente de novo.',
    },
    listError: 'Não consegui carregar as histórias. Verifique a conexão e recarregue.',
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
  listen: {
    tagline: 'Ouça a história.',
    confirm: 'Já ouvi a história completa',
  },
  cut: {
    title: 'Corte a história em cenas',
    reviewHeadline: 'A história está toda em cenas. Toque numa cena para reouvir.',
    instructionPre: 'Toque no colar onde esta cena ',
    instructionEmph: 'começa e termina',
    instructionPost: '.',
    instructionReplay: '. Toque numa cena pronta para reouvir.',
    sceneLabel: 'Cena {{ordinal}}',
    sceneLabelBare: 'Cena',
    /* Nome do fio de contas do rodapé (ENG-388). Digit-free: o leitor de tela
       anuncia o grupo, e cada conta já se anuncia pela sua cena. */
    stripAria: 'cenas costuradas',
    remove: 'Remover',
    chipOpen: 'ver as ações desta cena',
    back: '← Ouvir de novo',
    halfSelection: 'Toque no colar onde esta cena termina.',
    confirmScene: '✓ Confirmar esta cena',
    confirmAll: 'Confirmar as cenas →',
  },
  phrases: {
    reviewHeadline: 'As frases desta cena estão prontas. Toque numa frase para reouvir.',
    instruction: 'Toque no colar onde esta frase começa e termina.',
    instructionReplay: ' Toque numa frase pronta para reouvir.',
    halfSelection: 'Toque no colar onde esta frase termina.',
    stripAria: 'frases desta cena',
    remove: 'Remover',
    chipOpen: 'ver as ações desta frase',
    back: '← Voltar',
    confirmPhrase: '✓ Confirmar esta frase',
    doneLast: 'Já segmentei todas as cenas →',
    doneMore: 'Pronto com esta cena →',
  },
  tutorial: {
    tips: {
      listen: 'Ouçam a história inteira. O botão grande toca e pausa.',
      cut: 'Marquem onde cada cena termina, uma de cada vez.',
      triage: 'Classifiquem cada cena. Toquem para ouvi-la de novo.',
      phrases: 'Dentro de cada cena, marquem onde cada frase começa e termina.',
      conversation: 'Façam as perguntas em voz alta e gravem as respostas.',
      export: 'Guardem a sessão para gerar os documentos.',
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
      description: 'O relatório editável, com o texto confirmado de cada resposta.',
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
  triage: {
    reviewHeadline: 'Todas as cenas classificadas.',
    empty: 'Nenhuma cena confirmada ainda.',
    instruction: 'Essa cena é sobre o quê?',
    colarHint: 'toque no colar para ouvir esta cena',
    tagNoneFit: '⌀ nenhum se encaixa',
    tagPending: '— por classificar',
    back: '← Cortar cenas',
    confAlta: 'certeza',
    confMedia: 'quase',
    confBaixa: 'na dúvida',
    finding: '⌀ Nenhum se encaixa',
    lockout: '⚠ Nenhuma cena se encaixa em Rute. Segmentação e Mapeamento ficam travadas.',
  },
  triagePicker: {
    swap: 'trocar tipo',
    confidenceQuestion: 'O quanto isso parece certo pra você?',
    confirm: 'Confirmar',
    noneFit: 'Nenhum se encaixa',
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
  conversation: {
    listenStory: '▶ ouvir a história',
    listenScene: '▶ ouvir a cena',
    listenPhrase: '▶ ouvir a frase',
    pauseStory: '⏸ pausar a história',
    pauseScene: '⏸ pausar a cena',
    pausePhrase: '⏸ pausar a frase',
    trechoStory: 'a história inteira',
    trechoScene: 'uma cena',
    blockScene: 'Cena {{ordinal}}',
    blockPhrase: 'Frase {{ordinal}}',
    recordError: 'A resposta não foi guardada. Grave de novo.',
    reportAria: 'relatório',
    reportFallback: 'A conversa terminou. O relatório abre aqui.',
    preparingReviewEyebrow: 'Abrindo',
    preparingReview: 'Trazendo os áudios de volta para a revisão…',
    toExport: 'Guardar os documentos →',
    prev: '← anterior',
    pendingDrafts: {
      title_one: 'Falta confirmar a transcrição de 1 resposta.',
      title_other: 'Faltam confirmar as transcrições de {{count}} respostas.',
      body: 'A gravação fica guardada, mas não entra no documento — só o texto confirmado entra. Guardar os documentos vai recusar enquanto faltar alguma.',
      review: 'Revisar as respostas',
      anyway: 'Ir mesmo assim',
    },
  },
  seamModal: {
    headline: 'A frase passou da borda da cena.',
    subline: 'Para onde vai a costura?',
    consequence: 'A cena de hoje cresce, a vizinha encolhe',
    move: 'Mover a borda até aqui',
    moveAnyway: 'Mover mesmo assim',
    backToTriage: 'Voltar à Triagem',
    reanchor: 'Reancorar dentro da cena',
    markerBefore: 'borda de hoje',
    markerAfter: 'borda nova',
  },
  report: {
    eyebrow: 'A conversa sobre o sentido',
    headline: 'Tudo que vocês falaram, reunido.',
    facilitatorLed: 'conduzida pela facilitadora',
    answerDuration: 'duração da resposta',
    answer: 'resposta',
    typedAria: 'observação da facilitadora',
    groupStory: 'A história inteira',
    groupScene: 'Cena {{n}}',
    groupPhrase: 'Frase {{n}}',
    playAnswer: '▶ ouvir a resposta',
    pauseAnswer: '⏸ pausar a resposta',
    openingAnswer: 'abrindo a resposta…',
    noAnswerYet: 'ainda sem resposta gravada',
    noAnswerGiven: 'sem resposta',
    voicePending: 'procurando a resposta gravada',
    writeAnswer: 'escrever a resposta',
    addNote: 'acrescentar uma observação',
    draftsRegion: 'rascunhos das respostas',
    draftsReady_one: 'Sugestão pronta — {{count}} resposta para revisar.',
    draftsReady_other: 'Sugestão pronta — {{count}} respostas para revisar.',
    transcribingEyebrow: 'Ouvindo',
    transcribing: 'transcrevendo a resposta…',
    editAnswer: 'editar a resposta',
    discardEdit: 'descartar a edição',
    acceptEdit: 'aceitar a edição',
    draftBadge: 'sugestão — revise',
    draftSource: 'o que se ouviu — corrija se preciso',
    draftConfirm: 'confirmar a transcrição',
    draftRetry: 'tentar de novo',
    draftFailed: 'não consegui transcrever agora — dá para escrever a resposta à mão',
    /* Confirmar recusado. O silêncio seria o pior desfecho: a pessoa segue achando que
       confirmou, e o documento sai com a tradução da frase anterior. */
    confirmFailed: 'não deu para guardar esta transcrição — ela segue por confirmar',
    confirmSuperseded: 'esta transcrição foi refeita — confira o texto novo antes de confirmar',
    /* Confirmar tudo de uma vez. A cópia é explícita sobre o que se está aceitando:
       texto de máquina, sem leitura resposta a resposta. Quem aceita é a facilitadora,
       e ela precisa saber o que está assinando. */
    bulkAction: 'Confirmar todas as transcrições',
    bulkTitle_one: 'Confirmar 1 transcrição de uma vez?',
    bulkTitle_other: 'Confirmar {{count}} transcrições de uma vez?',
    bulkBody:
      'Estes textos foram escritos por uma máquina a partir das gravações. Confirmar de uma vez aceita todos como estão, sem ler um a um, e eles passam a ser a resposta que vai para o documento. As gravações continuam guardadas, e qualquer resposta pode ser corrigida aqui depois.',
    bulkReview: 'Rever uma a uma',
    bulkAccept: 'Aceitar as transcrições',
    bulkResultRegion: 'resultado da confirmação em lote',
    bulkConfirmed_one: '1 resposta confirmada.',
    bulkConfirmed_other: '{{count}} respostas confirmadas.',
    bulkNothing: 'Nenhuma resposta foi confirmada.',
    bulkRemaining_one: 'Ainda falta 1 resposta gravada sem transcrição — escreva-a à mão.',
    bulkRemaining_other:
      'Ainda faltam {{count}} respostas gravadas sem transcrição — escreva-as à mão.',
  },
  conversationStage: {
    listen: 'Ouvir a pergunta',
    pause: 'Pausar a pergunta',
    saving: 'guardando a resposta',
    openingAnswer: 'abrindo a resposta…',
    pausePlayback: 'pausar',
    record: 'gravar a resposta',
    stop: 'Parar',
    idleHint: 'Toque e fale a sua resposta',
    /* Enquanto ainda não se sabe se esta pergunta tem resposta gravada. Toma o
       lugar do convite a falar — a tela do ouvinte tem UMA linha (§9.2). */
    checkingAnswer: 'procurando a resposta já gravada',
    emptyWave: 'a sua resposta vira um fio de som aqui',
    recordingLabel: 'gravando — os outros botões esperam a resposta',
    play: 'ouvir a resposta',
    again: 'gravar de novo',
    /* O tamanho da resposta em risco, por extenso — §9.2 proíbe dígito aqui.
       É escala, não cronômetro: numa advertência o que decide é QUANTO se
       perde, e "cerca de dois minutos" carrega isso melhor que "2:07". */
    answerLengthUnderMinute: 'menos de um minuto',
    answerLengthOneMinute: 'cerca de um minuto',
    answerLengthMinutes: 'cerca de {{minutos}} minutos',
    rerecordTitle: 'Gravar esta resposta de novo?',
    rerecordBody:
      'A resposta que já foi gravada ({{duration}}) será apagada, e uma nova gravação começa na hora. Isso não tem volta.',
    rerecordBodyUnknown:
      'A resposta que já foi gravada será apagada, e uma nova gravação começa na hora. Isso não tem volta.',
    rerecordConfirm: 'Apagar e gravar de novo',
    rerecordKeep: 'Manter a gravação',
    typedHint: 'A facilitadora pode escrever depois — nunca por você.',
    prev: '← anterior',
    next: 'Próxima pergunta',
    skip: 'sem resposta',
    unskip: 'voltar a perguntar',
    progressAria: 'progresso da conversa',
  },
};

export type Dict = typeof pt;
