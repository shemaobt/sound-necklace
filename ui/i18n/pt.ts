/**
 * Dicionário PT-BR — o idioma default da UI (ENG-279). Estes valores reproduzem
 * EXATAMENTE a cópia PT-BR que já vivia hardcoded nas telas; os testes de UI provam
 * que nada mudou. Só o CHROME da UI passa por aqui. (Este bloco também prometia que
 * os artefatos exportados nunca passariam pelo i18n — não há mais artefato nenhum,
 * ENG-689/ENG-691.)
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
    soundMenu: 'Som e volume',
    storyVolume: 'Volume da história',
    unmute: 'Ligar o som da interface',
    settings: 'Configurações',
    // o rótulo diz o DESTINO, não o estado: quem ouve o leitor de tela precisa
    // saber o que o clique faz; o ícone (lua/sol) já diz a mesma coisa por olho
    themeToDark: 'Mudar para o tema escuro',
    themeToLight: 'Mudar para o tema claro',
  },
  autosave: {
    saving: 'Salvando…',
    saved: 'Tudo salvo',
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
      'Foi escolhido para o projeto inteiro e não muda mais. Mudá-lo agora mudaria a referência de tudo o que já foi cortado.',
    granConfirm: 'Confirmar — isto não muda depois',
    granConfirming: 'Confirmando…',
    granAskAdmin: 'Peça a quem administra o projeto para escolher o tamanho da conta.',
    granForbidden: 'Só quem administra o projeto pode escolher o tamanho da conta.',
    granAlreadyConfirmed: 'O tamanho da conta deste projeto já foi confirmado e não muda mais.',
    granSaveError: 'Não foi possível confirmar. Tente de novo.',
    sampleDensity_one: 'Neste tamanho, {{seconds}} segundos desta história viram 1 conta.',
    sampleDensity_other:
      'Neste tamanho, {{seconds}} segundos desta história viram {{count}} contas.',
    samplePlay: '▶ Ouvir esta amostra',
    sampleStop: '⏸ Parar',
    sampleLoading: 'Carregando o áudio…',
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
    /* O rodapé ERA a divulgação de uso de modelo (ENG-700). As três exceções que ele
       divulgava — voz sintética, transcrição de máquina, tradução de máquina — saíram
       com a Conversa (ENG-689/ENG-691) e o produto não usa modelo nenhum. Sobrou a
       custódia, que continua verdadeira; não entra substituto sobre modelo, porque
       não há o que divulgar. */
    disclosure: 'O áudio e o trabalho de vocês ficam guardados no seu projeto.',
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
    /* A meta de hoje (ENG-653): cartão de FACILITADORA, e por isso os rótulos
       podem contar cenas — §9.2 vale para quem ouve. As "12 conversas" saíram com
       a Conversa (ENG-689). */
    goal: {
      heading: 'Até onde vamos hoje?',
      eyebrow: 'só a facilitadora',
      note: 'A meta é conforto, não regra.',
      twoScenes: '2 cenas',
      fourScenes: '4 cenas',
      triage: 'fechar a Triagem',
      phrases: 'fechar as Frases',
      wholeStory: 'a história toda',
    },
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
   * Os rótulos das QUATRO estações que sobraram (ENG-689/ENG-691), numa fonte ÚNICA:
   * a faixa de progresso do shell e
   * o relance do dashboard leem daqui. Duplicar isto fazia o shell dizer "Ouvir"
   * enquanto o dashboard dizia "Listen".
   */
  stations: {
    listen: 'Ouvir',
    cut: 'Cortar',
    triage: 'Triagem',
    phrases: 'Frases',
  },
  shell: {
    /** Nome acessível da faixa do topo — a etapa atual + a barra (ENG-668). */
    progressAria: 'Progresso da sessão',
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
  /**
   * A pausa sugerida (ENG-650; protótipo v4 "PAUSA SUGERIDA"). Depois de um bom
   * tempo de trabalho o app SUGERE descansar. Nunca diz QUANTO tempo passou: é
   * tela de quem ouve, e §9.2 não admite número, contagem nem id.
   */
  breakSuggestion: {
    headline: 'Já foi bastante coisa boa por agora.',
    body: 'Um cafezinho, um alongamento — o colar fica guardado exatamente onde parou.',
    take: 'Fazer uma pausa',
    keepGoing: 'Seguir mais um pouco',
  },
  /* A meta de hoje alcançada (ENG-653): sem número nenhum — esta tela é vista
     pelos dois, e quem ouve não conta nada (§9.2). */
  goalReached: {
    headline: 'A meta de hoje está no cordão.',
    body: 'E ainda tem fôlego? O que vem agora é curtinho.',
    keepGoing: 'Seguir mais um pouco',
    stopForToday: 'Guardar por hoje',
  },
  /**
   * O fim de bloco (ENG-651; protótipo v4 "FIM DE BLOCO"). Nos dois limites
   * estruturais do fluxo, uma tela marca que um bloco fechou. A manchete nomeia o
   * bloco que TERMINOU; o primário nomeia o que começa. Tela de quem ouve: nenhum
   * dígito, nenhuma contagem, nenhum id (§9.2).
   */
  blockDone: {
    eyebrow: 'Um bloco fechado',
    rest: 'Guardar e descansar',
    triagem: {
      headline: 'As cenas todas têm nome.',
      subtitle: 'Agora vem a parte de dentro: as frases de cada cena.',
      primary: 'Seguir para as frases',
    },
    /* O fim do fluxo (ENG-689): não há mais o que prometer depois das frases, e o
       apoio não pode continuar apontando para uma conversa que saiu. O que ficou
       verdadeiro é o que a pessoa acabou de fazer — e que está guardado. */
    segmentacao: {
      headline: 'Todas as frases no cordão.',
      subtitle: 'O trabalho de hoje está inteiro, e já guardado. Podem descansar.',
      primary: 'Voltar às histórias',
    },
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
    downloaded: 'Baixado',
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
    renameSession: 'Renomear a história',
    deleteSession: 'Apagar a história',
    renameDialog: {
      title: 'Renomear “{{story}}”',
      /* O nome de exibição muda; o slug não (§10.6) — e o slug é o nome com que a
         história está guardada no servidor. Dizer isso evita a facilitadora esperar
         que o que já está guardado siga o nome novo. Os "documentos" que esta linha
         citava saíram com a exportação (ENG-689/ENG-691, ENG-700). */
      body: 'Muda só o nome que aparece aqui. O nome com que a história está guardada no projeto não muda.',
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
         quem confirma precisa poder perceber que pegou o cartão errado (§9.4). As
         gravações de voz das respostas saíram da lista com a Conversa — não há
         resposta nem gravação neste produto (ENG-689/ENG-691, ENG-700). */
      body: 'Some tudo desta história: os cortes e as classificações. Não dá para desfazer.',
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
    instruction: 'Divida a cena: toque no colar onde esta frase começa e termina.',
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
    },
    never: 'Não mostrar de novo',
    triggerAria: 'Como funciona esta etapa',
    contentAria: 'Dica desta etapa',
    close: 'Fechar dica',
  },
  connectionGate: {
    offline: 'Sem conexão',
    rest: '— a edição está pausada e nada se perde. O áudio continua tocando; retomamos assim que a conexão voltar.',
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
    /* O Mapeamento saiu com a Conversa (ENG-689/ENG-691): o aviso travava uma etapa
       que não existe mais (ENG-700). Sobrou a Segmentação, que a trava de fato pega. */
    lockout: '⚠ Nenhuma cena se encaixa em Rute. A Segmentação fica travada.',
  },
  triagePicker: {
    swap: 'Trocar tipo',
    confidenceQuestion: 'O quanto isso parece certo pra você?',
    confirm: 'Confirmar',
    noneFit: 'Nenhum se encaixa',
    groupAria: 'Tipos de cena',
  },
  coverageDrawer: {
    tabAria: 'Cobertura (facilitadora)',
    tabLabel: 'cobertura',
    title: 'Cobertura · só facilitadora',
    close: 'Fechar',
    introPre: 'Cenas produtivas: ',
    introPost: '. Contagem por tipo (dado da facilitadora, escondido do ouvinte).',
    counts: 'firme {{firm}} · hesitante {{hesitant}} · alvo {{target}}',
    absence: 'Candidatos a ausência (raras em aberto)',
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
};

export type Dict = typeof pt;
