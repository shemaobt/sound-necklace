import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Player } from '../../../adapters/audio';
import type { SpeechSynthesizer } from '../../../adapters/tts/types';
import type { UiSound } from '../../../adapters/ui-sound';
import type { Recording, Unsubscribe, VoiceRecorder } from '../../../adapters/voice/types';
import {
  ensureMapping,
  type Mapping,
  type QuestionSlot,
  questionSequence,
  setMode,
  type SessionState,
  voiceAnswerPath,
} from '../../../domain';
import { questionNoteFor, questionTextFor } from '../../i18n/mapeamento-questions';
import { Button } from '../../atoms';
import {
  ConversationStage,
  type ConversationProgress,
  type RecorderState,
  WAVE_BARS,
} from '../../organisms/conversation-stage/conversation-stage';
import { sessionStore, useAppStore, useSessionStore } from '../../state';
import './mapeamento.css';

/**
 * A estação Conversa (Mapeamento — PRD v2 §8.7, redesign §6.6): a conversa inteira,
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
export interface MapeamentoProps {
  player?: Player | null;
  recorder?: VoiceRecorder | null;
  /** A voz da UI (§9): gravar, parar e chegar ao relatório têm som. */
  sound?: UiSound;
  /** Porta de fala (ENG-280): ausente = sem voz (ambiente sem Web Speech) e o botão some. */
  speaker?: SpeechSynthesizer | null;
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
const relatorioModules = import.meta.glob('/ui/pages/relatorio/index.tsx', {
  eager: true,
}) as Record<string, { default: ComponentType<RelatorioSlotProps> }>;

/** O relatório descobre as gravações pela MESMA porta de voz da entrevista. */
interface RelatorioSlotProps {
  recorder?: VoiceRecorder | null;
}

/** Resolvido uma vez, no carregamento do módulo (o glob é eager e estático). */
const RelatorioStation: ComponentType<RelatorioSlotProps> | null =
  Object.values(relatorioModules)[0]?.default ?? null;

/** Lê a resposta de texto da pergunta em foco (string vazia quando ainda não há). */
function readAnswer(m: Mapping | null, slot: QuestionSlot): string {
  if (!m) return '';
  if (slot.level === 1) return m.level1[slot.k] ?? '';
  if (slot.level === 2) return m.level2[slot.partId]?.[slot.k] ?? '';
  return m.level3[slot.propId]?.[slot.k] ?? '';
}

interface ListenTarget {
  key: string;
  s: number;
  e: number;
  label: string;
}

type Translate = (key: string) => string;

/** O ▶ da pergunta atual: a história inteira (N1), a cena (N2) ou a frase (N3). */
function listenFor(state: SessionState, slot: QuestionSlot, t: Translate): ListenTarget | null {
  if (slot.level === 1) {
    return { key: 'historia', s: 0, e: state.totalBeads - 1, label: t('mapeamento.listenStory') };
  }
  if (slot.level === 2) {
    const p = state.parts.find((x) => x.part_id === slot.partId);
    return p?.span
      ? { key: p.part_id, s: p.span.s, e: p.span.e, label: t('mapeamento.listenScene') }
      : null;
  }
  const fr = state.frases.find((x) => x.prop_id === slot.propId);
  return fr?.span
    ? { key: fr.prop_id, s: fr.span.s, e: fr.span.e, label: t('mapeamento.listenPhrase') }
    : null;
}

interface QuestionScreenProps {
  slot: QuestionSlot;
  path: string;
  listen: ListenTarget | null;
  progress: ConversationProgress;
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
  progress,
  onPrev,
  onNext,
  player,
  recorder,
  speaker,
  sound,
  muted,
  onVoiceSaved,
}: QuestionScreenProps) {
  const { t, i18n } = useTranslation();
  const [recorderState, setRecorderState] = useState<RecorderState>('idle');
  const [levels, setLevels] = useState<number[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [recordError, setRecordError] = useState(false);
  // A RESPOSTA desta pergunta está tocando — dos eventos reais da porta (ENG-322).
  const [answerPlaying, setAnswerPlaying] = useState(false);
  // Entre o toque e o som há fetch+decode no modo real (ENG-336): o botão diz
  // que está abrindo; qualquer emissão da porta encerra a espera.
  const [answerOpening, setAnswerOpening] = useState(false);
  const recordingRef = useRef<Recording | null>(null);
  const unsubRef = useRef<Unsubscribe | null>(null);
  const mountedRef = useRef(true);

  // A pergunta EXIBIDA é a que se fala: texto e voz nunca divergem (ENG-279/280).
  const questionText = questionTextFor(slot, i18n.language);
  const speechLang = i18n.language.startsWith('en') ? 'en-US' : 'pt-BR';
  const canSpeak = speaker !== null && !muted;

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

  // Chegar numa pergunta a faz ser falada (a tela remonta por `key={path}`). Com o som
  // desligado não fala; sair da pergunta cancela a fala em curso (nada de voz órfã).
  useEffect(() => {
    if (!speaker || muted) return;
    speaker.speak(questionText, speechLang);
    return () => speaker.stop();
  }, [speaker, muted, questionText, speechLang]);

  useEffect(() => {
    let alive = true;
    mountedRef.current = true;
    if (recorder) {
      void recorder
        .has(path)
        .then((h) => {
          if (alive && h) setRecorderState('recorded');
        })
        // fronteira de IO real (ENG-247): consulta falhou → segue como não gravada
        .catch(() => undefined);
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

  const playSpan = (): void => {
    if (player && listen) player.toggle(listen.key, listen.s, listen.e);
  };

  const onRecord = async (): Promise<void> => {
    if (!recorder) return;
    const rec = await recorder.start(path);
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
    try {
      await rec.stop();
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
    setRecorderState('recorded');
    // Voz salva no caminho canônico: avisa o shell para registrá-lo em meta.voice (§10.4).
    onVoiceSaved?.(path);
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
  const onRerecord = (): void => {
    setLevels([]);
    setRecorderState('idle');
  };

  return (
    <section className="cds-mapeamento">
      <p className="cds-mapeamento-instruction" data-role="instruction">
        {t('mapeamento.instruction')}
      </p>

      {recordError ? (
        <p className="cds-mapeamento-error" role="alert">
          {t('mapeamento.recordError')}
        </p>
      ) : null}

      {listen ? (
        <div className="cds-mapeamento-listen">
          <Button variant="ghost" size="sm" onClick={playSpan}>
            {listen.label}
          </Button>
        </div>
      ) : null}

      <ConversationStage
        question={questionText}
        note={questionNoteFor(slot, i18n.language)}
        facilitatorLed={slot.k === 'ausencia'}
        recorderState={recorderState}
        levels={levels}
        onRecord={onRecord}
        onStop={onStop}
        onPlay={onPlay}
        onRerecord={onRerecord}
        answerPlaying={answerPlaying}
        answerOpening={answerOpening}
        onStopPlay={() => recorder?.stopPlayback()}
        progress={progress}
        onPrev={onPrev}
        onNext={onNext}
        speaking={speaking}
        onSpeakQuestion={
          // falando ⇒ pausar; calado ⇒ (re)falar — o rótulo do organismo acompanha (ENG-317)
          canSpeak
            ? () => (speaking ? speaker.stop() : speaker.speak(questionText, speechLang))
            : undefined
        }
      />
    </section>
  );
}

export function Mapeamento({
  player = null,
  recorder = null,
  speaker = null,
  sound,
  onVoiceSaved,
  onGoToExport,
  voicePaths = () => [],
}: MapeamentoProps) {
  const { t } = useTranslation();
  const muted = useAppStore((s) => s.muted);
  const session = useSessionStore((s) => s.session);

  // Para LEITURA, uma visão com o answer store garantido mesmo antes do efeito de
  // persistência rodar; a extensão real do store passa pelo apply guardado abaixo.
  const mapped = useMemo(() => {
    if (!session) return null;
    return session.mapping ? session : ensureMapping(session);
  }, [session]);
  const sequence = useMemo(() => (mapped ? questionSequence(mapped) : []), [mapped]);

  // Resume (ENG-321): the conversation reopens on the first question with NO
  // answer at all — text in the answer store OR voice persisted in `meta.voice`.
  // Whoever stopped at the 5th returns to the 5th; everything answered reopens
  // on the last one (the report is one step away). Mount only: from then on the
  // cursor belongs to the user.
  const [index, setIndex] = useState(() => {
    if (!mapped || sequence.length === 0) return 0;
    const voiced = voicePaths();
    const first = sequence.findIndex(
      (s2) => !readAnswer(mapped.mapping, s2).trim() && !voiced.includes(voiceAnswerPath(s2)),
    );
    return first === -1 ? sequence.length - 1 : first;
  });
  const [atReport, setAtReport] = useState(false);

  useEffect(() => {
    if (session && !session.mapping) sessionStore.getState().apply((s) => ensureMapping(s));
  }, [session]);
  useEffect(() => {
    if (!player) return;
    return () => player.stop();
  }, [player]);

  if (!session || !mapped || !sequence.length) return null;

  const total = sequence.length;
  const idx = Math.min(index, total - 1);
  const slot = sequence[idx]!;
  const path = voiceAnswerPath(slot);

  if (atReport) {
    return (
      <section className="cds-mapeamento" aria-label={t('mapeamento.reportAria')}>
        {RelatorioStation ? (
          // sem o recorder o relatório não acha gravação nenhuma e todo card cai no
          // "ainda sem resposta gravada" — a voz da entrevista ficava inalcançável lá
          <RelatorioStation recorder={recorder} />
        ) : (
          <div className="cds-mapeamento-report-fallback">
            <p>{t('mapeamento.reportFallback')}</p>
          </div>
        )}
        <div className="cds-mapeamento-controls">
          <Button variant="ghost" size="sm" onClick={() => setAtReport(false)}>
            {t('mapeamento.prev')}
          </Button>
          {onGoToExport ? (
            <Button
              variant="primary"
              data-role="primary-action"
              onClick={() => {
                sound?.advance();
                onGoToExport();
              }}
            >
              {t('mapeamento.toExport')}
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  const goPrev = (): void => {
    if (idx > 0) setIndex(idx - 1);
    else sessionStore.getState().apply((s) => setMode(s, 'segmentacao'));
  };
  const goNext = (): void => {
    if (idx < total - 1) setIndex(idx + 1);
    else {
      sound?.advance(); // a conversa acabou: a prévia do relatório é a próxima etapa
      setAtReport(true);
    }
  };
  // Fio de progresso (indicador, não gate): as perguntas com resposta de TEXTO.
  // O caminho já andado o organismo acende sozinho (`i < current`, protótipo), que
  // é o que faz o fio significar algo numa entrevista só-voz — este conjunto só
  // acrescenta as respondidas ADIANTE da atual (quem voltou não apaga o que fez).
  // ponytail: teto conhecido — uma resposta só-de-voz à frente da atual não acende,
  // pois `recorder.has()` é assíncrono; enumerar a voz vale um passo síncrono só
  // quando o progresso virar informação carregada (não é o caso hoje).
  const answered = new Set(
    sequence.flatMap((s2, i) => (readAnswer(mapped.mapping, s2).trim() ? [i] : [])),
  );

  return (
    <QuestionScreen
      key={path}
      slot={slot}
      path={path}
      listen={listenFor(mapped, slot, t)}
      progress={{ total, answered, current: idx }}
      onPrev={goPrev}
      onNext={goNext}
      player={player}
      recorder={recorder}
      speaker={speaker}
      sound={sound}
      muted={muted}
      onVoiceSaved={onVoiceSaved}
    />
  );
}

export default Mapeamento;
