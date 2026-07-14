import { useTranslation } from 'react-i18next';

import { Button, WaveformBar } from '../../atoms';
import { BeadRow, type BeadCell, QuestionCard } from '../../molecules';
import { StorytellerGuide } from '../storyteller-guide';
import './conversation-stage.css';

/** Estado da resposta em voz — a máquina vive na página; o organismo só a desenha. */
export type RecorderState = 'idle' | 'recording' | 'recorded';

export interface ConversationProgress {
  /** total de perguntas do roteiro para esta estrutura */
  total: number;
  /** índices já respondidos */
  answered: ReadonlySet<number>;
  /** pergunta em foco */
  current: number;
}

export interface ConversationStageProps {
  question: string;
  /** observação da pergunta (nota da facilitadora, quando houver) */
  note?: string;
  /** pergunta conduzida pela facilitadora — mostra o marcador de papel */
  facilitatorLed?: boolean;
  recorderState: RecorderState;
  /** alturas (px) das barras da forma de onda ao vivo; a página as atualiza durante a gravação */
  levels?: number[];
  onRecord?: () => void;
  onStop?: () => void;
  onPlay?: () => void;
  onRerecord?: () => void;
  progress: ConversationProgress;
  onPrev?: () => void;
  onNext?: () => void;
  /** porta de fala (TTS): o botão "Ouvir a pergunta" só aparece quando fornecida */
  onSpeakQuestion?: () => void;
  /**
   * O guia está FALANDO agora (ENG-280) — dirige o lip-sync. Vem do estado real da porta
   * de voz (`onSpeaking`: start/end do utterance), nunca de um palpite: até a ENG-280 isto
   * era `recorderState === 'idle'`, ou seja, o guia mexia a boca em silêncio.
   */
  speaking?: boolean;
}

/** Quadrado de parar (protótipo recording), herdando a cor do botão. */
function StopGlyph() {
  return (
    <svg
      className="cds-conversation-stage-mic-glyph"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

/** Alto-falante do "Ouvir a pergunta" (protótipo speakQ). */
function SpeakGlyph() {
  return (
    <svg
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor" stroke="none" />
      <path d="M15 9a4 4 0 0 1 0 6" />
      <path d="M18 6.5a8 8 0 0 1 0 11" />
    </svg>
  );
}

/** Microfone como SVG inline (nunca unicode), herdando a cor do botão. */
function MicGlyph() {
  return (
    <svg
      className="cds-conversation-stage-mic-glyph"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 15a4 4 0 0 0 4-4V6a4 4 0 0 0-8 0v5a4 4 0 0 0 4 4Z" />
      <path
        d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * O palco da conversa do Mapeamento (redesign §6.6): guia à esquerda, a pergunta
 * grande em Merriweather à direita, a resposta por voz (microfone → forma de onda
 * ao vivo → ouvir/de novo), o canal digitado opcional e um fio de contas de
 * progresso — uma conta por pergunta, sem números (§9.2). Apresentacional: toda
 * a máquina de estados chega por props e sai por callbacks; o MediaRecorder vive
 * no adapter, ligado pela página.
 */
export function ConversationStage({
  question,
  note,
  facilitatorLed = false,
  recorderState,
  levels = [],
  onRecord,
  onStop,
  onPlay,
  onRerecord,
  progress,
  onPrev,
  onNext,
  onSpeakQuestion,
  speaking = false,
}: ConversationStageProps) {
  const { t } = useTranslation();
  // protótipo thread: respondidas/passadas 15px, a atual 22px com halo (CSS).
  // O protótipo mostra 11 perguntas; o roteiro real chega a 41 — janela em volta
  // da atual para o fio nunca estourar a largura (sem scroll, §9.2).
  const THREAD_WINDOW = 23;
  const start =
    progress.total <= THREAD_WINDOW
      ? 0
      : Math.max(
          0,
          Math.min(
            progress.current - Math.floor(THREAD_WINDOW / 2),
            progress.total - THREAD_WINDOW,
          ),
        );
  const beads: BeadCell[] = Array.from(
    { length: Math.min(progress.total, THREAD_WINDOW) },
    (_, offset) => {
      const i = start + offset;
      return {
        key: i,
        state: i === progress.current ? 'head' : progress.answered.has(i) ? 'lit' : 'unplayed',
        size: i === progress.current ? 22 : 15,
      } satisfies BeadCell;
    },
  );

  return (
    <div className="cds-conversation-stage">
      <div className="cds-conversation-stage-main">
        <div className="cds-conversation-stage-guide">
          <StorytellerGuide speaking={speaking} />
          {onSpeakQuestion ? (
            <button
              type="button"
              className="cds-conversation-stage-speak"
              onClick={onSpeakQuestion}
            >
              <SpeakGlyph />
              {t('conversationStage.listen')}
            </button>
          ) : null}
        </div>

        <div className="cds-conversation-stage-panel">
          <QuestionCard
            question={question}
            facilitatorLed={facilitatorLed}
            roleTitle={t('questionCard.roleTitle')}
          >
            {note ? <p className="cds-conversation-stage-note">{note}</p> : null}

            <div className="cds-conversation-stage-divider" aria-hidden="true" />

            <div className="cds-conversation-stage-wave-row">
              <div className="cds-conversation-stage-waveform" aria-hidden="true">
                {recorderState === 'recording'
                  ? levels.map((height, i) => <WaveformBar key={i} height={height} active />)
                  : Array.from({ length: 46 }, (_, i) => <WaveformBar key={i} height={8} />)}
              </div>

              {recorderState === 'recorded' ? (
                <div className="cds-conversation-stage-review">
                  <Button variant="ghost" size="sm" onClick={onPlay}>
                    {t('conversationStage.play')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onRerecord}>
                    {t('conversationStage.again')}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="cds-conversation-stage-recorder" data-state={recorderState}>
              {recorderState !== 'recorded' ? (
                <button
                  type="button"
                  className="cds-conversation-stage-mic"
                  data-recording={recorderState === 'recording' || undefined}
                  aria-label={
                    recorderState === 'recording'
                      ? t('conversationStage.stop')
                      : t('conversationStage.record')
                  }
                  onClick={recorderState === 'recording' ? onStop : onRecord}
                >
                  {recorderState === 'recording' ? <StopGlyph /> : <MicGlyph />}
                </button>
              ) : null}

              <div className="cds-conversation-stage-hint">
                <p className="cds-conversation-stage-hint-strong">
                  {recorderState === 'recording'
                    ? t('conversationStage.recordingLabel')
                    : t('conversationStage.idleHint')}
                </p>
                <p className="cds-conversation-stage-typed-hint">
                  {t('conversationStage.typedHint')}
                </p>
              </div>
            </div>
          </QuestionCard>
        </div>
      </div>

      <div className="cds-conversation-stage-footer">
        <div className="cds-conversation-stage-nav">
          {onPrev ? (
            <Button variant="ghost" size="sm" onClick={onPrev}>
              {t('conversationStage.prev')}
            </Button>
          ) : null}
          {onNext ? (
            <Button variant="dark" size="sm" onClick={onNext}>
              {t('conversationStage.next')}
            </Button>
          ) : null}
        </div>
        <div
          className="cds-conversation-stage-progress"
          role="group"
          aria-label={t('conversationStage.progressAria')}
        >
          <BeadRow beads={beads} />
        </div>
      </div>
    </div>
  );
}
