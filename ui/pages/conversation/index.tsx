import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Player } from '../../../adapters/audio';
import type { Transcriber } from '../../../adapters/stt/types';
import { type ResourcePath, reportExportStatus } from '../../../contracts';
import type { SpeechSynthesizer } from '../../../adapters/tts/types';
import type { UiSound } from '../../../adapters/ui-sound';
import type { Recording, Unsubscribe, VoiceRecorder } from '../../../adapters/voice/types';
import {
  ensureMapping,
  type QuestionSlot,
  questionSequence,
  setMode,
  type SessionState,
  voiceAnswerPath,
} from '../../../domain';
import { questionExampleFor, questionTextFor } from '../../i18n/conversation-questions';
import { Button } from '../../atoms';
import { type ConversationTrecho, TrechoIndicator } from '../../molecules';
import {
  ConversationStage,
  type ConversationProgress,
  type RecorderState,
  WAVE_BARS,
} from '../../organisms/conversation-stage/conversation-stage';
import type { PaletteEntry } from '../../tokens';
import { cardinal, sceneOrdinal } from '../cut/cutting';
import { clearSkipped, isSkipped, lastAnsweredIndex, markSkipped } from './answered';
import { type BlockLabels, blockEyebrow, buildTrechos } from './trechos';
import { type BulkOutcome, PendingDraftsDialog } from './pending-drafts-dialog';
import {
  type ConversationMode,
  ConversationModePicker,
} from '../../organisms/conversation-mode-picker/conversation-mode-picker';
import { useOpenMicWhenSpoken, useSpeakOnArrival, useSpokenYet } from './hands-free';
import { StationNav } from '../../organisms/nav-footer/nav-footer';
import { PreparingSession } from '../../organisms/preparing-session/preparing-session';
import { appStore, sessionStore, useAppStore, useSessionStore } from '../../state';
import './conversation.css';

/**
 * A estação Conversa (Conversation — PRD v2 §8.7, redesign §6.6): a conversa inteira,
 * uma pergunta por tela, na ordem exata que o domínio produz (`questionSequence`:
 * 11 de nível 1 → 5 por cena travada, none_fit incluída → 5 por frase de cena
 * produtiva). Cada tela reusa o organismo `conversation-stage` (guia + pergunta em
 * Merriweather + gravador de voz + fio de contas sem dígitos §9.2 + canal digitado
 * da facilitadora) e mostra o ▶ do trecho relevante (a história / a cena / a frase).
 *
 * Camada de wiring: o índice da pergunta é andaime de tela (o domínio não guarda
 * `mapStep`); avançar/voltar cruza os níveis só andando o índice — a primeira
 * pergunta volta à Segmentação (`setMode`), a última leva ao relatório. As
 * respostas de texto passam por `setAnswer` do domínio (store preguiçoso, nunca
 * perde respostas); as de voz vão pela porta `VoiceRecorder`, chaveadas pelo
 * caminho canônico `respostas/…` (`voiceAnswerPath`, §10.4). O áudio e o gravador
 * chegam por prop; nada de shell/organismo/domínio muda.
 */
export interface ConversationProps {
  player?: Player | null;
  recorder?: VoiceRecorder | null;
  /** A voz da UI (§9): gravar, parar e chegar ao relatório têm som. */
  sound?: UiSound;
  /** Porta de fala (ENG-280): ausente = sem voz (ambiente sem Web Speech) e o botão some. */
  speaker?: SpeechSynthesizer | null;
  /** Transcrição+tradução: o relatório dispara o job ao abrir (ENG-327). */
  stt?: Transcriber | null;
  /** Id da sessão — o job de transcrição é por sessão. */
  sessionId?: string | null;
  /** Versão da gravação de cada resposta: regravar invalida o rascunho (ENG-327). */
  recordingVersion?: Record<string, number>;
  /** O shell registra o caminho `respostas/…` recém-gravado no `meta.voice` da sessão (ENG-276). */
  onVoiceSaved?: (path: string) => void;
  /**
   * `respostas/…` paths already persisted (`meta.voice`) — resume opens on the
   * first question with NO answer at all, and in a voice-only interview the text
   * answer store does not know what has been spoken (ENG-321). It is a getter,
   * called ONCE on mount (initialization), because the source lives in a shell
   * ref — reading it in render is forbidden, reading it at init is not.
   */
  voicePaths?: () => readonly string[];
  /**
   * Entra na cauda "Guardar" (protótipo `toExport`). Ausente = sem a saída: a
   * Export é estado LOCAL do shell (o domínio não tem modo `export`), então quem
   * a abre é ele. Sem isto o relatório era um beco — só o fio de contas do
   * cabeçalho levava adiante, e chrome não é ação.
   */
  onGoToExport?: () => void;
}

/** A tela do relatório (ENG-250) entra por add-a-file: presente → renderiza; ausente → o passo fica em espera. */
const reportModules = import.meta.glob('/ui/pages/report/index.tsx', {
  eager: true,
}) as Record<string, { default: ComponentType<ReportSlotProps> }>;

/** O relatório descobre as gravações pela MESMA porta de voz da entrevista. */
interface ReportSlotProps {
  recorder?: VoiceRecorder | null;
  /** Descoberta de voz feita pelo preparo pré-revisão (ENG-337). */
  preloaded?: { checked: ReadonlySet<string>; has: ReadonlySet<string> };
  /** Transcrição+tradução das respostas gravadas (ENG-327). */
  stt?: Transcriber | null;
  sessionId?: string | null;
  recordingVersion?: Record<string, number>;
  /** The transcription wait took the screen: this station's footer leaves with it. */
  onWaitingChange?: (waiting: boolean) => void;
  /** A confirmação em lote da revisão, publicada para o aviso de saída (ENG-512). */
  onBulkConfirmChange?: (bulk: BulkConfirmHandle | null) => void;
}

/**
 * A ação de confirmar todas as transcrições, tal como a folha do relatório a publica
 * (ENG-512). Declarada aqui pelo mesmo motivo que `ReportSlotProps`: aquela estação
 * entra por add-a-file e pode não existir — ausente, `bulk` fica nulo e a ação some.
 * Quem confirma continua sendo ela; o que atravessa é o ponteiro.
 */
interface BulkConfirmHandle {
  /** Quantas respostas o lote confirmaria agora — as que têm rascunho e célula vazia. */
  confirmable: number;
  /** Confirma-as e devolve o que de fato aconteceu, medido depois de escrever. */
  confirmAll: () => BulkOutcome;
}

/**
 * Teto da pré-descoberta (ENG-337): um caminho que não responder até aqui entra
 * na revisão sem veredito e a própria linha re-descobre (fallback da ENG-319) —
 * o preparo nunca vira beco.
 */
const PREPARE_TIMEOUT_MS = 8000;

/** Nenhuma gravação descoberta ainda — identidade estável, fora do render. */
const NO_VOICE: ReadonlySet<string> = new Set<string>();

/**
 * A pausa entre parar de gravar e a próxima pergunta chegar sozinha (ENG-649,
 * protótipo v4 `_armAuto`). Curta o bastante para não virar espera, longa o
 * bastante para ser vista vindo e desfeita com um toque.
 */
const AUTO_ADVANCE_MS = 2600;

/**
 * Advancing past an answer recorded IN THIS SITTING starts its transcription.
 *
 * Moving on IS the acceptance: the facilitator had the take in front of them, could
 * have redone it, and went forward instead. Firing on `stop()` would pay for every take
 * replaced before anyone moves — the very reason the job used to wait for the report.
 * Waiting for the report, though, meant finishing the interview and then sitting
 * through every transcription at once.
 *
 * "Recorded in this sitting" and not "has a recording" — that distinction is the whole
 * guard. `meta.voice` accumulates every answer ever recorded, so keying on it made
 * re-walking a finished interview fire one request per question: a session with 14
 * scenes runs to ~396 questions, and each request publishes a queue event to ask for
 * work the server already has. An answer recorded in an earlier sitting either has its
 * draft or will get it from the report's own trigger.
 *
 * Fire-and-forget, deliberately. This runs on the way to the next question, and the
 * interview is what must never stall on the network (ENG-338). The report's trigger is
 * idempotent and seeds whatever a lost request left behind, so a failure here costs
 * latency at the end and nothing else.
 *
 * A take redone AFTER advancing is not re-asked here: its draft is already `ready` and a
 * plain POST leaves it alone. The report resolves that one, because that is where the
 * durable record of which version was transcribed lives.
 */
function requestTranscription(
  stt: Transcriber | null,
  sessionId: string | null,
  path: ResourcePath,
  recordedNow: ReadonlySet<string>,
): void {
  if (!stt || !sessionId || !recordedNow.has(path)) return;
  void stt.start(sessionId, [path]).catch(() => undefined);
}

/** Resolvido uma vez, no carregamento do módulo (o glob é eager e estático). */
const ReportStation: ComponentType<ReportSlotProps> | null =
  Object.values(reportModules)[0]?.default ?? null;

interface ListenTarget {
  key: string;
  s: number;
  e: number;
  /** rótulo quando parado (▶ ouvir …) */
  label: string;
  /** rótulo enquanto o trecho toca (⏸ pausar …) — o botão alterna com o playback */
  pauseLabel: string;
}

type Translate = (key: string) => string;

/** O ▶ da pergunta atual: a história inteira (N1), a cena (N2) ou a frase (N3). */
function listenFor(state: SessionState, slot: QuestionSlot, t: Translate): ListenTarget | null {
  if (slot.level === 1) {
    return {
      key: 'historia',
      s: 0,
      e: state.totalBeads - 1,
      label: t('conversation.listenStory'),
      pauseLabel: t('conversation.pauseStory'),
    };
  }
  if (slot.level === 2) {
    const p = state.parts.find((x) => x.part_id === slot.partId);
    return p?.span
      ? {
          key: p.part_id,
          s: p.span.s,
          e: p.span.e,
          label: t('conversation.listenScene'),
          pauseLabel: t('conversation.pauseScene'),
        }
      : null;
  }
  const fr = state.frases.find((x) => x.prop_id === slot.propId);
  return fr?.span
    ? {
        key: fr.prop_id,
        s: fr.span.s,
        e: fr.span.e,
        label: t('conversation.listenPhrase'),
        pauseLabel: t('conversation.pausePhrase'),
      }
    : null;
}

interface QuestionScreenProps {
  slot: QuestionSlot;
  path: string;
  listen: ListenTarget | null;
  /** o eyebrow do bloco atual (cor + rótulo "Cena um · tipo") para o indicador ao lado do ▶ */
  trecho: { color: PaletteEntry; eyebrow: string };
  progress: ConversationProgress;
  trechos: readonly ConversationTrecho[];
  onPrev: () => void;
  onNext: () => void;
  player: Player | null;
  recorder: VoiceRecorder | null;
  speaker: SpeechSynthesizer | null;
  /** A voz da UI (§9): gravar e parar têm som. */
  sound?: UiSound;
  /** Toggle de som do cabeçalho: mudo = a voz nunca toca (§13 — nunca falar sem consentimento). */
  muted: boolean;
  onVoiceSaved?: (path: string) => void;
  /** A pergunta está marcada como sem resposta (ver `./answered`). */
  skipped: boolean;
  onToggleSkip: () => void;
  /**
   * Como a conversa anda agora (ENG-649) — a pílula do palco o diz e o troca.
   * `null` = ninguém escolheu ainda: o pedido está por cima, a pílula não existe
   * (não teria o que dizer) e nada automático corre.
   */
  mode: ConversationMode | null;
  onToggleMode: () => void;
  /**
   * Há uma pergunta DEPOIS desta. Só então o avanço automático se arma: a última
   * pergunta não empurra ninguém para o relatório — chegar ao fim da entrevista é
   * um ato, e um ato que ninguém pediu não acontece sozinho.
   */
  hasNext: boolean;
}

/**
 * Uma pergunta da conversa. Montada com `key={path}` pelo pai → trocar de pergunta
 * remonta a tela com o gravador limpo (o reset de estado é a `key`, não um efeito);
 * a checagem inicial de "já existe gravação?" fica no `.then` assíncrono.
 */
function QuestionScreen({
  slot,
  path,
  listen,
  trecho,
  progress,
  trechos,
  onPrev,
  onNext,
  player,
  recorder,
  speaker,
  sound,
  muted,
  onVoiceSaved,
  skipped,
  onToggleSkip,
  mode,
  onToggleMode,
  hasNext,
}: QuestionScreenProps) {
  const { t, i18n } = useTranslation();
  /**
   * Começa em `checking` quando há porta de voz: saber se esta pergunta já tem
   * resposta é uma ida à rede, e até ela responder a tela não sabe. Antes disto o
   * estado inicial era `idle` — o convite a falar e a promessa do fio de som, ou
   * seja, a AFIRMAÇÃO de que não há resposta, na pergunta que já tinha uma. Sem
   * gravador não há o que consultar e não existe espera nenhuma.
   */
  const [recorderState, setRecorderState] = useState<RecorderState>(recorder ? 'checking' : 'idle');
  const [levels, setLevels] = useState<number[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [recordError, setRecordError] = useState(false);

  // O "← Histórias" do cabeçalho vive fora desta estação e é o único caminho de
  // saída que o palco não desenha (ENG-393). Espelhar o estado num efeito, em vez
  // de acender e apagar a bandeira em cada transição, cobre TODA saída de graça —
  // inclusive a falha de salvamento e o desmonte ao trocar de pergunta.
  useEffect(() => {
    appStore.getState().setRecording(recorderState === 'recording');
    return () => appStore.getState().setRecording(false);
  }, [recorderState]);
  // Quanto tempo de resposta existe hoje — a confirmação de regravar diz o que
  // está em risco (ENG-392). `undefined` = ainda não se sabe (ou a consulta falhou).
  const [answerSeconds, setAnswerSeconds] = useState<number | undefined>(undefined);

  /* Segundos → palavras, no idioma da UI (§9.2: a tela do ouvinte não mostra
     dígito). Acima de 99 minutos `cardinal` devolve '' e o diálogo cai na frase
     sem tamanho — melhor omitir do que imprimir um número solto. */
  const answerLength = ((): string | undefined => {
    if (answerSeconds === undefined) return undefined;
    if (answerSeconds < 60) return t('conversationStage.answerLengthUnderMinute');
    const minutos = Math.round(answerSeconds / 60);
    if (minutos === 1) return t('conversationStage.answerLengthOneMinute');
    const porExtenso = cardinal(minutos, i18n.language);
    return porExtenso
      ? t('conversationStage.answerLengthMinutes', { minutos: porExtenso })
      : undefined;
  })();
  // A RESPOSTA desta pergunta está tocando — dos eventos reais da porta (ENG-322).
  const [answerPlaying, setAnswerPlaying] = useState(false);
  // Entre o toque e o som há fetch+decode no modo real (ENG-336): o botão diz
  // que está abrindo; qualquer emissão da porta encerra a espera.
  const [answerOpening, setAnswerOpening] = useState(false);
  // O TRECHO (história/cena/frase) está tocando agora — para o botão alternar
  // "▶ ouvir" ⇄ "⏸ pausar" (protótipo playBlock/blockPlaying).
  const [spanPlaying, setSpanPlaying] = useState(false);
  const recordingRef = useRef<Recording | null>(null);
  const unsubRef = useRef<Unsubscribe | null>(null);
  const mountedRef = useRef(true);

  // A pergunta EXIBIDA é a que se fala: texto e voz nunca divergem (ENG-279/280).
  const questionText = questionTextFor(slot, i18n.language);
  const speechLang = i18n.language.startsWith('en') ? 'en-US' : 'pt-BR';
  const canSpeak = speaker !== null && !muted;
  /**
   * O exemplo falado desta pergunta (ENG-611) — congelado em `domain/`, no idioma
   * da UI. `undefined` aqui apaga o link inteiro: pergunta sem exemplo escrito não
   * ganha controle nenhum, e com o som desligado ele some junto com "Ouvir a
   * pergunta" (a única coisa que ele faz é falar).
   */
  const exampleText = questionExampleFor(slot, i18n.language);

  // O lip-sync segue o estado REAL da porta (start/end do utterance), nunca um palpite.
  // Assina ANTES do efeito que fala — senão a 1ª transição sai antes de haver ouvinte.
  useEffect(() => {
    if (!speaker) return;
    return speaker.onSpeaking(setSpeaking);
  }, [speaker]);

  // Ouvir ⇄ pausar da resposta gravada: o estado vem dos eventos de reprodução da
  // porta (nunca palpite) e é DESTA pergunta — outra resposta tocando não acende aqui.
  useEffect(() => {
    if (!recorder) return;
    return recorder.onPlayback((p) => {
      setAnswerPlaying(p === path);
      setAnswerOpening(false);
    });
  }, [recorder, path]);

  const handsFree = mode === 'auto';
  /**
   * Chegar numa pergunta a faz ser falada — em MÃOS LIVRES (a tela remonta por
   * `key={path}`). Em toque a toque o app fica calado até alguém tocar "Ouvir a
   * pergunta": é o que separa os dois modos, e é o modo quieto que precisa ser
   * mesmo quieto. Sair da pergunta cancela a fala em curso (nada de voz órfã).
   */
  const spoken = useSpokenYet({ willSpeak: handsFree && canSpeak, speaker });
  useSpeakOnArrival({ handsFree, speaker, muted, text: questionText, lang: speechLang });

  useEffect(() => {
    let alive = true;
    mountedRef.current = true;
    if (recorder) {
      /**
       * O veredito só vale enquanto ninguém agiu: quem tocou o microfone durante a
       * procura já está gravando, e um "existe resposta" chegando depois arrancava a
       * forma de onda ao vivo do meio da fala, com o microfone ainda captando. Sair
       * de `checking` é o que fecha essa porta — e é também o que faz a espera não
       * durar mais que ela mesma.
       */
      const settle = (next: RecorderState) =>
        setRecorderState((prev) => (prev === 'checking' ? next : prev));
      void recorder
        .has(path)
        .then(async (h) => {
          if (!alive) return;
          if (!h) {
            settle('idle');
            return;
          }
          settle('recorded');
          // a duração só interessa para a pergunta de regravar; falha dela não
          // muda o estado — a confirmação abre sem o número, nunca com um falso
          const sec = await recorder.duration(path).catch(() => undefined);
          if (alive && sec !== undefined) setAnswerSeconds(sec);
        })
        // fronteira de IO real (ENG-247): consulta falhou → segue como não gravada
        .catch(() => {
          if (alive) settle('idle');
        });
    }
    // Sair da tela (trocar de pergunta remonta pela `key`) descarta a gravação em
    // curso — solta o microfone/stream do `getUserMedia` (Recording.cancel, §12).
    return () => {
      alive = false;
      mountedRef.current = false;
      unsubRef.current?.();
      recordingRef.current?.cancel();
    };
  }, [recorder, path]);

  // O playhead do trecho: para no fim/stop → `null` (volta a "ouvir"); tocando →
  // acende se for ESTE trecho. O pause NÃO emite (o player só congela), então o
  // clique atualiza otimista pelo `state` pós-toggle (playSpan).
  useEffect(() => {
    if (!player) return;
    return player.onHead((bead) => {
      setSpanPlaying(bead !== null && player.state.key === listen?.key);
    });
  }, [player, listen?.key]);

  /**
   * A próxima pergunta chegando sozinha (ENG-649, protótipo v4 `_armAuto`). Vive
   * nesta tela, que remonta a cada pergunta (`key={path}`): sair da estação a
   * desmonta, e o desmonte cancela — um relógio que sobrevivesse à saída faria a
   * conversa andar numa tela que não existe mais.
   */
  const [autoAdvancing, setAutoAdvancing] = useState(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelAuto = useCallback((): void => {
    if (autoTimer.current !== null) {
      clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
    setAutoAdvancing(false);
  }, []);
  useEffect(() => cancelAuto, [cancelAuto]);
  const armAuto = (): void => {
    if (!handsFree || !hasNext) return;
    cancelAuto();
    setAutoAdvancing(true);
    autoTimer.current = setTimeout(() => {
      autoTimer.current = null;
      setAutoAdvancing(false);
      onNext();
    }, AUTO_ADVANCE_MS);
  };
  /**
   * Alguém agiu nesta pergunta. A partir daí quem conduz é essa pessoa: o microfone
   * não abre mais sozinho aqui (`useOpenMicWhenSpoken`), porque abrir depois de um
   * gesto humano é o app passando por cima de quem acabou de decidir algo.
   */
  const [autoMicArmed, setAutoMicArmed] = useState(true);
  /**
   * Todo ato deliberado mata a espera pela próxima pergunta e desarma o microfone
   * automático. Envolver os handlers — em vez de espalhar as duas chamadas por
   * dentro de cada um — é o que faz um controle novo no palco nascer cancelando,
   * em vez de nascer esquecido. Gravar e regravar são a exceção: eles fazem as duas
   * coisas por dentro, porque abrir o microfone é um ato mesmo quando é o próprio
   * mãos livres que o pede, e nenhum embrulho estaria lá nesse caminho.
   */
  const deliberate =
    <A extends unknown[]>(run: (...args: A) => void) =>
    (...args: A): void => {
      cancelAuto();
      setAutoMicArmed(false);
      run(...args);
    };

  /**
   * A fala em curso morre ao sair da pergunta E ao desligar o som — venha ela da
   * chegada automática ou do botão "Ouvir a pergunta". O mudo é §13 ("nunca falar
   * sem consentimento") e não é só sobre não começar: mudo também apaga o botão de
   * pausar da tela, então uma fala que sobrevivesse ao mudo continuaria sem
   * nenhum controle à vista. Este efeito não pertence ao mãos livres.
   */
  useEffect(() => {
    if (!speaker) return;
    return () => speaker.stop();
  }, [speaker, path, muted]);

  const playSpan = (): void => {
    if (!player || !listen) return;
    player.toggle(listen.key, listen.s, listen.e);
    const st = player.state;
    setSpanPlaying(st.key === listen.key && st.playing && !st.paused);
  };

  /**
   * Uma abertura de microfone por vez. Entre pedir `start()` e o estado virar
   * "gravando" há um await, e nesse intervalo a tela ainda se diz parada — um
   * segundo pedido chegando ali abriria um segundo microfone e jogaria fora o
   * que já estava sendo dito. É o caminho que o mãos livres criou: silenciar a
   * pergunta para gravar TERMINA a fala, e o fim da fala é justamente o que
   * manda o microfone abrir.
   */
  const openingRef = useRef(false);
  const onRecord = async (): Promise<void> => {
    if (!recorder || openingRef.current) return;
    openingRef.current = true;
    // abrir o microfone É o ato que encerra a espera pela próxima pergunta e
    // desarma o automático — inclusive quando quem abre é o próprio mãos livres
    cancelAuto();
    setAutoMicArmed(false);
    // O microfone abre num silêncio: a história tocando no colar, a pergunta na
    // voz do guia e a resposta anterior em reprodução entravam TODAS pelo mesmo
    // ar — a gravação saía com a fala da pessoa por baixo do som do app.
    player?.stop();
    setSpanPlaying(false);
    speaker?.stop();
    recorder.stopPlayback();
    let rec;
    try {
      rec = await recorder.start(path);
    } finally {
      openingRef.current = false;
    }
    // desmontou durante o await (navegou depressa) → descarta e não escreve estado
    if (!mountedRef.current) {
      rec.cancel();
      return;
    }
    recordingRef.current = rec;
    setRecordError(false);
    sound?.recordStart();
    unsubRef.current = rec.onLevel((l) =>
      setLevels((prev) => [...prev, Math.max(2, Math.round(l * 40))].slice(-WAVE_BARS)),
    );
    setRecorderState('recording');
  };
  const onStop = async (): Promise<void> => {
    const rec = recordingRef.current;
    if (!rec) return;
    unsubRef.current?.();
    unsubRef.current = null;
    // o stop embute o PUT da resposta (modo real): daqui até confirmar, o estado é
    // "guardando" — spinner no botão, sem aceitar clique (ENG-318); antes disto a
    // tela dizia "Gravando…" enquanto na verdade persistia.
    setRecorderState('saving');
    let answer;
    try {
      answer = await rec.stop();
    } catch {
      // fronteira de IO real (ENG-247): no modo real o stop embute o PUT da resposta
      // (rede/413 podem falhar) — a gravação se perdeu; volta ao microfone com a
      // orientação curta, sem punir (§9), em vez de ficar presa em "gravando".
      recordingRef.current = null;
      if (mountedRef.current) {
        setLevels([]);
        setRecorderState('idle');
        setRecordError(true);
        sound?.refuse();
      }
      return;
    }
    recordingRef.current = null;
    // desmontou durante o await (navegou depressa) → não toca estado nem registra o
    // caminho no meta.voice: `onVoiceSaved` leria a sessão/rota JÁ trocada e gravaria
    // esta resposta na sessão errada (contaminação cross-sessão). Espelha `onRecord`.
    if (!mountedRef.current) return;
    sound?.recordStop();
    setAnswerSeconds(answer.durationSec);
    setRecorderState('recorded');
    // Voz salva no caminho canônico: avisa o shell para registrá-lo em meta.voice (§10.4).
    onVoiceSaved?.(path);
    armAuto();
  };
  const onPlay = (): void => {
    if (!recorder) return;
    // tocar busca os bytes na API no modo real — falha vira o som de recusa, não
    // uma rejeição solta; a espera acaba com a emissão da porta ou com a falha
    setAnswerOpening(true);
    void recorder.play(path).catch(() => {
      setAnswerOpening(false);
      sound?.refuse();
    });
  };
  /**
   * Só chega aqui depois da confirmação (ENG-392) — e então é uma intenção só:
   * a resposta antiga sai e a nova gravação começa na hora. Devolver o microfone
   * parado obrigaria a um segundo toque para fazer o que já foi decidido.
   */
  const onRerecord = (): void => {
    setLevels([]);
    setAnswerSeconds(undefined);
    setRecorderState('idle');
    void onRecord();
  };

  /**
   * O microfone abrindo sozinho, em mãos livres, quando a pergunta acaba de ser
   * falada. `idle` é a trava inteira — é ela que o mantém fora de uma gravação em
   * curso, de uma resposta que já existe, da procura e do salvamento.
   */
  useOpenMicWhenSpoken({
    handsFree,
    spoken,
    armed: autoMicArmed,
    ready: recorderState === 'idle',
    // o MESMO caminho do toque no microfone, sem o toque: não existe segunda
    // maneira de abrir uma gravação, e por isso a trava contra reentrância vale
    // para os dois
    open: () => void onRecord(),
  });

  return (
    <section className="cds-conversation">
      {recordError ? (
        <p className="cds-conversation-error" role="alert">
          {t('conversation.recordError')}
        </p>
      ) : null}

      <ConversationStage
        question={questionText}
        header={
          <TrechoIndicator color={trecho.color} label={trecho.eyebrow}>
            {listen ? (
              <Button variant="ghost" size="sm" onClick={deliberate(playSpan)}>
                {spanPlaying ? listen.pauseLabel : listen.label}
              </Button>
            ) : null}
          </TrechoIndicator>
        }
        facilitatorLed={slot.k === 'ausencia'}
        recorderState={recorderState}
        levels={levels}
        onRecord={onRecord}
        onStop={onStop}
        onPlay={deliberate(onPlay)}
        onRerecord={onRerecord}
        // pedir para regravar nasce dentro do palco (a confirmação é dele), então
        // é ele quem avisa: sem isto a conversa andava por baixo de quem estava
        // decidindo, e levava a confirmação junto
        onRerecordAsk={deliberate(() => {})}
        answerLength={answerLength}
        // toque recusado durante a gravação: responde ao ouvido, não com texto (§9.4)
        onBlocked={() => sound?.refuse()}
        answerPlaying={answerPlaying}
        answerOpening={answerOpening}
        onStopPlay={() => recorder?.stopPlayback()}
        progress={progress}
        trechos={trechos}
        onPrev={deliberate(onPrev)}
        onNext={deliberate(onNext)}
        skipped={skipped}
        onToggleSkip={deliberate(onToggleSkip)}
        speaking={speaking}
        mode={mode ?? undefined}
        onToggleMode={deliberate(onToggleMode)}
        autoAdvancing={autoAdvancing}
        autoAdvanceMs={AUTO_ADVANCE_MS}
        onSpeakQuestion={
          // falando ⇒ pausar; calado ⇒ (re)falar — o rótulo do organismo acompanha (ENG-317)
          canSpeak
            ? deliberate(() =>
                speaking ? speaker.stop() : speaker.speak(questionText, speechLang),
              )
            : undefined
        }
        onSpeakExample={
          // MESMA porta da pergunta: pedir o exemplo com a pergunta ainda sendo lida
          // interrompe a leitura, porque `speak` cancela a fala em curso (contrato da
          // porta). Duas vozes no mesmo ar seria o único desfecho pior.
          canSpeak && exampleText
            ? deliberate(() => speaker.speak(exampleText, speechLang))
            : undefined
        }
      />
    </section>
  );
}

export function Conversation({
  player = null,
  recorder = null,
  speaker = null,
  sound,
  onVoiceSaved,
  onGoToExport,
  voicePaths = () => [],
  stt = null,
  sessionId = null,
  recordingVersion,
}: ConversationProps) {
  const { t, i18n } = useTranslation();
  const muted = useAppStore((s) => s.muted);
  const session = useSessionStore((s) => s.session);

  // Para LEITURA, uma visão com o answer store garantido mesmo antes do efeito de
  // persistência rodar; a extensão real do store passa pelo apply guardado abaixo.
  const mapped = useMemo(() => {
    if (!session) return null;
    return session.mapping ? session : ensureMapping(session);
  }, [session]);
  const sequence = useMemo(() => (mapped ? questionSequence(mapped) : []), [mapped]);

  /**
   * Resume (ENG-321): the cursor follows the LAST answer — text in the answer store
   * OR voice persisted in `meta.voice` — and reopens on the question after it.
   *
   * It used to open on the FIRST question with no answer, which read a skipped
   * question as a pending one. Skipping is deliberate: not recording IS the answer,
   * an empty one. So one skip early in the interview became a permanent hole, and a
   * session recorded up to the 40th reopened on the 2nd, every single time, with
   * dozens of clicks between the facilitator and where they actually stopped.
   * A skipped question is still reachable through "← anterior" and the bead thread.
   *
   * Walking backwards cures the hole in the MIDDLE; the mark cures the hole at the
   * END, which no scan can infer. An interview whose last questions went unanswered
   * has its last answer somewhere upstream, so the cursor lands on the first refusal
   * and stays there — every reopen, with the review out of reach. Deciding that a
   * question goes unanswered is an act, and `./answered` is where it is recorded.
   *
   * Mount only: from then on the cursor belongs to the user.
   */
  const lastAnswered = (): number => (mapped ? lastAnsweredIndex(mapped, voicePaths()) : -1);
  const [index, setIndex] = useState(() =>
    Math.min(lastAnswered() + 1, Math.max(sequence.length - 1, 0)),
  );
  /**
   * The session was RESUMED at the end, rather than reaching it through this mount's
   * `goNext` — a distinction `atReport` alone loses the moment anyone advances. Frozen
   * as initial state because recording an answer changes what `lastAnswered` returns.
   */
  const [resumedAtReport] = useState(
    () => sequence.length > 0 && lastAnswered() === sequence.length - 1,
  );
  /**
   * ENG-367: leaving and coming back does not return to the interview when there is
   * nothing left to ask. The LAST question answered means the conversation reached its
   * end — reopening on it invited re-recording an answer that already existed. Holes
   * behind it are deliberate skips, not pending work, and do not hold the session in
   * the interview.
   */
  const [atReport, setAtReport] = useState(() => resumedAtReport);
  /**
   * Como a conversa anda nesta passagem (ENG-649). `null` = a dupla ainda não
   * escolheu, e o pedido do modo está de pé.
   *
   * É estado de TELA, de propósito: não entra no DTO da sessão. O protótipo v4
   * re-pergunta a cada entrada na conversa, e re-perguntar é o comportamento
   * certo — quem conduz pode ser outra pessoa, num outro dia, com outra dupla.
   */
  // `setMode` já é o do domínio (o modo da SESSÃO); este é o da conversa.
  const [mode, setPassMode] = useState<ConversationMode | null>(null);
  // Preparo pré-revisão (ENG-337): a descoberta das respostas roda ANTES de abrir
  // o relatório — ele chega pronto, sem "procurando" pipocando linha a linha. Uma
  // vez pronto, re-entradas abrem direto (o preparo re-roda por baixo, silencioso).
  const [reportReady, setReportReady] = useState(false);
  // The report sheet signals when the transcription wait takes over the screen; the
  // footer belongs to this station, and without the signal it survived the wait.
  const [transcribing, setTranscribing] = useState(false);
  /** Saída para a Export pedida com transcrição por confirmar: pergunta antes de andar. */
  const [confirmLeaving, setConfirmLeaving] = useState(false);
  /** A confirmação em lote publicada pela revisão (ENG-512). Nula = não há o que correr. */
  const [bulk, setBulk] = useState<BulkConfirmHandle | null>(null);
  /** O que o lote fez quando foi corrido daqui — nulo enquanto não foi. */
  const [bulkOutcome, setBulkOutcome] = useState<BulkOutcome | null>(null);
  const [reportVoice, setReportVoice] = useState<{
    checked: ReadonlySet<string>;
    has: ReadonlySet<string>;
  } | null>(null);
  const aliveRef = useRef(true);
  /**
   * The answers recorded in THIS sitting — what the transcription trigger keys on.
   * `meta.voice` accumulates every answer ever recorded, so using it made re-walking a
   * finished interview ask for work the server already has, once per question.
   */
  const recordedNow = useRef<Set<string>>(new Set());
  const noteVoiceSaved = useCallback(
    (p: string) => {
      recordedNow.current.add(p);
      onVoiceSaved?.(p);
    },
    [onVoiceSaved],
  );

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (session && !session.mapping) sessionStore.getState().apply((s) => ensureMapping(s));
  }, [session]);
  useEffect(() => {
    if (!player) return;
    return () => player.stop();
  }, [player]);

  /**
   * Descobre as respostas gravadas ANTES da revisão (ENG-337). Um caminho que não
   * responder no teto entra sem veredito (a linha re-descobre); falha resolve como
   * "sem gravação" pelo catch — o preparo nunca segura a revisão para sempre. É
   * também onde os rascunhos de transcrição (ENG-327) serão aguardados.
   */
  const prepareReview = useCallback(async (): Promise<void> => {
    if (!recorder) {
      setReportReady(true);
      return;
    }
    const paths = sequence.map((s2) => voiceAnswerPath(s2));
    /**
     * Descobre, sem AQUECER. A ENG-339 baixava aqui cada resposta existente, para a
     * revisão abrir com o áudio pronto de tocar; numa entrevista de 14 cenas isso é
     * baixar dezenas de MB de uma vez, e a facilitadora vai tocar um punhado deles.
     *
     * O áudio agora é baixado ao tocar, e o cache persistente (@/adapters/voice/
     * cached-store) faz a segunda vez — e toda reabertura da sessão — sair do disco.
     * A troca é uma pequena espera no primeiro play de cada resposta, contra uma
     * espera longa e a maior parte do tráfego desperdiçada ao abrir a revisão.
     */
    const discover = (p: string): Promise<boolean> => recorder.has(p).catch(() => false);
    const results = await Promise.all(
      paths.map((p) =>
        Promise.race([
          discover(p),
          new Promise<null>((res) => setTimeout(() => res(null), PREPARE_TIMEOUT_MS)),
        ]),
      ),
    );
    if (!aliveRef.current) return;
    const checked = new Set<string>();
    const has = new Set<string>();
    results.forEach((r, i) => {
      if (r === null) return; // sem veredito: a linha da revisão re-descobre
      checked.add(paths[i]!);
      if (r) has.add(paths[i]!);
    });
    setReportVoice({ checked, has });
    setReportReady(true);
  }, [recorder, sequence]);

  /**
   * Reopening STRAIGHT into the review has to prepare on its own. Preparation was only
   * ever triggered by `goNext`, so a session resumed with everything answered sat on
   * "bringing the audio back" forever — a dead end. Mount only: from there on `goNext`
   * owns the transition, and re-preparing on every render would redo the whole
   * discovery pass.
   */
  const preparedOnMount = useRef(false);
  useEffect(() => {
    if (!resumedAtReport || preparedOnMount.current) return;
    preparedOnMount.current = true;
    void prepareReview();
  }, [resumedAtReport, prepareReview]);

  if (!session || !mapped || !sequence.length) return null;

  const total = sequence.length;
  const idx = Math.min(index, total - 1);
  const slot = sequence[idx]!;
  const path = voiceAnswerPath(slot);

  if (atReport) {
    if (!reportReady) {
      // ainda não é o relatório: a região se anuncia como o preparo (role=status dentro)
      return (
        <section className="cds-conversation" aria-label={t('conversation.preparingReview')}>
          <PreparingSession
            eyebrow={t('conversation.preparingReviewEyebrow')}
            line={t('conversation.preparingReview')}
          />
        </section>
      );
    }
    // O MESMO número do gate que recusa guardar (`reportExportStatus`, ENG-327), lido
    // aqui uma tela antes. As gravações são as que o preparo da revisão descobriu — a
    // Export as relê do `meta.voice` persistido, que é a mesma verdade por outro
    // caminho. Sem descoberta ainda, o conjunto vazio diz "nada pendente": nesta tela
    // isso só adia o aviso para a Export, que é onde ele efetivamente tranca.
    const leaveWithPending = reportExportStatus(mapped, reportVoice?.has ?? NO_VOICE).pendingSlots;
    const leaveToExport = (): void => {
      sound?.advance();
      onGoToExport?.();
    };
    const closeWarning = (): void => {
      setConfirmLeaving(false);
      setBulkOutcome(null);
    };
    /**
     * Aceitar todas ali mesmo (ENG-512). A ação é a da revisão — a que reconfere a
     * elegibilidade dentro da transação e nunca escreve por cima de célula preenchida;
     * daqui só sai o clique.
     *
     * O que ela devolve é MEDIDO depois de escrever, não planejado: se o `apply` não
     * pegou (offline, revisão, trava) ela devolve zero confirmadas, e o aviso continua
     * de pé dizendo isso. Sobrou pendência — as gravações sem transcrição, que o lote
     * não alcança — a saída também não acontece: guardar recusaria do outro lado, e
     * andar depois de um "pronto" faria o diálogo prometer o que não cumpriu.
     */
    const confirmAllPending = (): void => {
      const result = bulk?.confirmAll() ?? { confirmed: 0, remaining: leaveWithPending };
      if (result.remaining === 0) {
        closeWarning();
        leaveToExport();
        return;
      }
      setBulkOutcome(result);
    };
    return (
      <section className="cds-conversation" aria-label={t('conversation.reportAria')}>
        {confirmLeaving ? (
          <PendingDraftsDialog
            pending={leaveWithPending}
            confirmable={bulk?.confirmable ?? 0}
            outcome={bulkOutcome}
            onConfirmAll={confirmAllPending}
            onReview={closeWarning}
            onProceed={() => {
              closeWarning();
              leaveToExport();
            }}
          />
        ) : null}
        {ReportStation ? (
          // sem o recorder o relatório não acha gravação nenhuma e todo card cai no
          // "ainda sem resposta gravada" — a voz da entrevista ficava inalcançável lá
          <ReportStation
            recorder={recorder}
            preloaded={reportVoice ?? undefined}
            stt={stt}
            sessionId={sessionId}
            recordingVersion={recordingVersion}
            onWaitingChange={setTranscribing}
            onBulkConfirmChange={setBulk}
          />
        ) : (
          <div className="cds-conversation-report-fallback">
            <p>{t('conversation.reportFallback')}</p>
          </div>
        )}
        {/* A prévia do relatório troca de PÁGINA (voltar à conversa / guardar os
            documentos), então vai ao rodapé — protótipo v3 §1. A navegação por
            PERGUNTA fica no corpo: ela anda dentro desta página.

            A guarda da ENG-367 continua: durante a espera da transcrição não se
            publica navegação nenhuma, senão a saída para a Export ficaria oferecida
            com os rascunhos ainda em voo. Não publicar é mais forte que esconder —
            o `hidden` de lá perdia para o `display: flex` da folha de estilo. */}
        {transcribing ? null : (
          <StationNav
            back={{ label: t('conversation.prev'), onClick: () => setAtReport(false) }}
            next={
              onGoToExport
                ? {
                    label: t('conversation.toExport'),
                    // A saída não é bloqueada — é perguntada. Guardar vai recusar do
                    // outro lado enquanto faltar transcrição confirmada, e chegar lá
                    // para descobrir isso diante de um botão morto é o que o diálogo
                    // evita. Quem quiser passar mesmo assim, passa (§9.5).
                    onClick: () =>
                      leaveWithPending > 0 ? setConfirmLeaving(true) : leaveToExport(),
                    enabled: true,
                  }
                : undefined
            }
          />
        )}
      </section>
    );
  }

  const goPrev = (): void => {
    if (idx > 0) setIndex(idx - 1);
    else sessionStore.getState().apply((s) => setMode(s, 'segmentacao'));
  };
  const goNext = (): void => {
    requestTranscription(stt, sessionId, path, recordedNow.current);
    if (idx < total - 1) setIndex(idx + 1);
    else {
      sound?.advance(); // a conversa acabou: a prévia do relatório é a próxima etapa
      setAtReport(true);
      void prepareReview();
    }
  };
  const skipped = isSkipped(mapped.mapping, slot);
  /**
   * Marcar segue para a próxima pergunta: registrar a recusa e continuar parado nela
   * pediria dois toques para uma decisão só. Desfazer NÃO navega — quem desfaz quer
   * justamente ficar nesta pergunta.
   */
  const toggleSkip = (): void => {
    sessionStore.getState().apply((s) => (skipped ? clearSkipped : markSkipped)(s, slot));
    if (!skipped) goNext();
  };
  /**
   * Gravar desfaz a marca: a pergunta foi respondida, afinal. Sem isto ela sobreviveria
   * à resposta e voltaria a valer se a gravação fosse apagada depois — uma recusa que
   * ninguém registrou.
   */
  const onAnswerRecorded = (p: string): void => {
    if (skipped) sessionStore.getState().apply((s) => clearSkipped(s, slot));
    noteVoiceSaved(p);
  };
  // Os trechos (história · cenas · frases): a barra usa a lista inteira (na ordem
  // da sequência, então o marcador cai no trecho certo); o indicador ao lado do ▶
  // usa o trecho da pergunta atual — mesma cor/rótulo do segmento correspondente.
  const trechoLabels = {
    story: t('conversation.trechoStory'),
    sceneUntyped: t('conversation.trechoScene'),
  };
  const trechos = buildTrechos(mapped, i18n.language, trechoLabels);
  // eyebrow do bloco no topo do painel — número por extenso (§9.2: a tela do
  // ouvinte soletra "Cena um", nunca dígito); o tipo da cena vem de sceneKindLabel.
  const blockLabels: BlockLabels = {
    story: t('conversation.trechoStory'),
    scene: (n) => t('conversation.blockScene', { ordinal: sceneOrdinal(n - 1, i18n.language) }),
    phrase: (n) => t('conversation.blockPhrase', { ordinal: sceneOrdinal(n - 1, i18n.language) }),
  };
  const trecho = blockEyebrow(mapped, slot, i18n.language, blockLabels);

  /**
   * O pedido do modo COBRE a pergunta até alguém escolher, em vez de tomar o lugar
   * dela (protótipo v4). A pergunta atrás fica inalcançável — o diálogo é modal —,
   * mas monta: quando a escolha chega, a procura pela resposta já gravada acabou, e
   * o mãos livres não estreia com uma espera. Nada automático corre enquanto não há
   * modo, porque tudo que é automático depende de `mãos livres`.
   *
   * Ele NÃO aparece na espera nem no relatório: uma pergunta que ninguém está
   * fazendo não tem andamento a decidir.
   */
  return (
    <>
      {mode === null ? (
        <ConversationModePicker
          onChoose={(chosen) => {
            sound?.advance();
            setPassMode(chosen);
          }}
        />
      ) : null}
      <QuestionScreen
        key={path}
        slot={slot}
        path={path}
        listen={listenFor(mapped, slot, t)}
        trecho={trecho}
        progress={{ total, current: idx }}
        trechos={trechos}
        onPrev={goPrev}
        onNext={goNext}
        player={player}
        recorder={recorder}
        speaker={speaker}
        sound={sound}
        muted={muted}
        onVoiceSaved={onAnswerRecorded}
        skipped={skipped}
        onToggleSkip={toggleSkip}
        mode={mode}
        onToggleMode={() => setPassMode(mode === 'auto' ? 'manual' : 'auto')}
        hasNext={idx < total - 1}
      />
    </>
  );
}

export default Conversation;
