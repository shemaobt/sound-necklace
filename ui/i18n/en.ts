import type { Dict } from './pt';

/**
 * Dicionário EN (ENG-279). Tipado como `Dict` (= `typeof pt`): o typecheck EXIGE as
 * mesmas chaves do PT — chave faltante ou sobrando quebra o build, garantindo paridade
 * PT/EN sem ferramenta extra. Tradução de chrome; os artefatos continuam PT-BR.
 */
export const en: Dict = {
  header: {
    eyebrow: 'Oral Archive · Tripod',
    title: 'Colar de Sons',
    subtitle: 'Mapping the oral archive stories.',
    mute: 'Turn interface sound off',
    unmute: 'Turn interface sound on',
    switchLanguage: 'Switch to Portuguese',
  },
  login: {
    title: 'Sign in',
    username: 'Username',
    password: 'Password',
    submit: 'Sign in',
    refused: 'Could not sign in. Check the username and password.',
  },
  setup: {
    title: 'New session',
    trustLine:
      'Your audio and answers are kept safely in your project. Only your team has access.',
    gridWarning: 'Lock the bead size before anchoring. Changing it later shifts the boundaries.',
    noAudio: 'Choose an audio file first.',
    noConsent: 'Confirm consent to use this in the pipeline to continue.',
    noBeadSec: 'I could not work out the bead size for this audio.',
    createFailed: 'Could not create the session. Try again.',
    decodeError: 'I could not decode this audio ({{detail}}). Try a PCM WAV.',
    doorsAria: 'How to start',
    doorZeroTitle: 'Start from scratch',
    doorZeroDesc: 'Choose an audio and anchor by ear.',
    doorEntregaTitle: 'Confirm a delivery',
    doorEntregaDesc: 'Load proposals from the project.',
    doorRetornoTitle: 'Resume a return',
    doorRetornoDesc: 'Continue from a saved return.',
    levelPequenaTitle: 'Small',
    levelPequenaDesc: 'shorter beads',
    levelMediaTitle: 'Medium',
    levelMediaDesc: 'balanced',
    levelGrandeTitle: 'Large',
    levelGrandeDesc: 'longer beads',
    audioHeading: 'Choose an audio from the project',
    loadingAudios: 'Loading the audio…',
    consentOk: 'Collection consent on record',
    consentWarn: 'No record of collection consent.',
    audioReady: 'Audio ready',
    granHeading: 'Bead size',
    titleField: 'Title / short name for the necklace',
    titlePlaceholder: 'e.g.: jesus-mienoi',
    consentCheck: 'I confirm consent to use this in the project pipeline.',
    creating: 'Creating…',
    create: 'Create the session →',
    importEntregaHint: 'Load a project delivery to confirm by ear.',
    importRetornoHint: 'Resume a saved return to carry on where you stopped.',
    goToImports: 'Go to the pipeline files →',
  },
  export: {
    headline: 'The whole story is in the necklace.',
    retornoBlocked: 'Confirm the necklace before exporting.',
    semFim: '{{n}} phrase(s) still without a locked end.',
    reopen: 'Unlock to edit',
    complete: 'Finish and save the documents',
  },
  imports: {
    guidanceNoSession: 'Open a session to load pipeline files.',
    title: 'Pipeline files',
    intro: 'Load a project delivery or resume a saved return.',
    doorEntrega: 'Load project delivery (.json)',
    doorRetorno: 'Resume saved return (.json)',
    targetEntrega: 'the delivery',
    targetRetorno: 'the return',
    failure: 'I could not read {{alvo}} ({{detail}}).',
    deliveryOk:
      '✓ Delivery loaded: {{cenas}} scene(s), {{frases}} phrase(s). The scenes are proposals — confirm by ear.',
    returnOk: '✓ Resumed: {{cenas}} scene(s), {{frases}} phrase(s).',
  },
  dashboard: {
    stepOuvir: 'Listen',
    stepCortar: 'Cut',
    stepTriagem: 'Triage',
    stepFrases: 'Phrases',
    stepConversa: 'Conversation',
    stepGuardar: 'Save',
    title: 'My sessions',
    newSession: 'New session',
    loading: 'Loading the sessions…',
    empty: 'You have no sessions yet.',
  },
  sessionList: {
    statusEmProgresso: 'in progress',
    statusConcluida: 'completed',
    resume: 'Resume',
    open: 'Open',
    progressAria: 'progress of {{name}}',
    listAria: 'sessions',
  },
  escuta1: {
    tagline: 'Listen to the story.',
    listen: 'Listen to the story',
    reopen: 'Reopen',
    confirm: 'I have heard the whole story',
  },
  escuta2: {
    instructionPre: 'Tap the necklace where ',
    instructionEmph: 'this scene ends',
    instructionPost: '. The beginning is already stitched.',
    reopen: 'Reopen',
    back: '← Back',
    confirmScene: '✓ Confirm this scene',
    confirmAll: 'Confirm the scenes →',
  },
  segmentacao: {
    instruction: 'Tap the necklace at the start and the end of each phrase.',
    playScene: '▶ listen to the scene',
    reopen: 'Reopen',
    flagMarked: '⚑ marked',
    flagReview: '⚑ review',
    remove: 'Remove',
    back: '← Back',
    confirmPhrase: '✓ Confirm this phrase',
    doneLast: 'I have segmented every scene →',
    doneMore: 'Done with this scene →',
  },
  tutorial: {
    tips: {
      escuta1:
        'Listen to the whole story together, without rushing. The big button plays and pauses; confirm once the story has been heard in full.',
      escuta2:
        'Tap a bead to listen from there. Mark together where each scene ends and confirm one scene at a time.',
      triagem:
        'Classify each scene by listening to it again. When no type fits, «none fits» is a finding too.',
      segmentacao:
        'Within each scene, mark the phrases: one tap where it begins, another where it ends. If a phrase runs past the border, the necklace offers paths.',
      mapeamento:
        'Ask the questions aloud and record the answers of the one who tells. You can write later — never for the listener.',
      export:
        'The whole story is in the necklace. Save the session to generate the project documents.',
    },
    never: 'Do not show again',
    triggerAria: 'How this step works',
    contentAria: 'Tip for this step',
    close: 'Close tip',
  },
  artifactCards: {
    retorno: {
      title: 'Your decisions',
      description: 'Where each scene and each phrase begins and ends, with the type and confidence.',
    },
    manifesto: {
      title: 'The map of the beads',
      description:
        'How the audio was sliced: each bead with its time. The exact match for this audio.',
    },
    relatorio: {
      title: 'The conversation about meaning',
      description: 'The editable report, with the voice answers referenced by question.',
    },
    saved: 'documents saved — nothing left this computer',
  },
  connectionGate: {
    offline: 'No connection',
    rest: '— editing is paused and nothing is lost. The audio keeps playing; we resume as soon as the connection is back.',
  },
  guide: {
    ariaLabel: 'the conversation guide',
  },
};
