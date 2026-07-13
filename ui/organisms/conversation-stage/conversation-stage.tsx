import type { ReactNode } from 'react';
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
  /** canal opcional: a facilitadora escreve depois — "nunca por você" */
  typedAnswer?: ReactNode;
  progress: ConversationProgress;
  onPrev?: () => void;
  onNext?: () => void;
  /** porta de fala (TTS): o botão "Ouvir a pergunta" só aparece quando fornecida */
  onSpeakQuestion?: () => void;
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
  typedAnswer,
  progress,
  onPrev,
  onNext,
  onSpeakQuestion,
}: ConversationStageProps) {
  const { t } = useTranslation();
  const beads: BeadCell[] = Array.from({ length: progress.total }, (_, i) => ({
    key: i,
    state: i === progress.current ? 'head' : progress.answered.has(i) ? 'lit' : 'unplayed',
    size: 14,
  }));

  return (
    <div className="cds-conversation-stage">
      <div className="cds-conversation-stage-main">
        <div className="cds-conversation-stage-guide">
          <StorytellerGuide speaking={recorderState === 'idle'} />
        </div>

        <div className="cds-conversation-stage-panel">
          <QuestionCard
            question={question}
            facilitatorLed={facilitatorLed}
            onListen={onSpeakQuestion}
            listenLabel={t('conversationStage.listen')}
          >
            {note ? <p className="cds-conversation-stage-note">{note}</p> : null}

            <div className="cds-conversation-stage-recorder" data-state={recorderState}>
              {recorderState === 'idle' ? (
                <button
                  type="button"
                  className="cds-conversation-stage-mic"
                  aria-label={t('conversationStage.record')}
                  onClick={onRecord}
                >
                  <MicGlyph />
                </button>
              ) : null}

              {recorderState === 'recording' ? (
                <>
                  <div className="cds-conversation-stage-waveform" aria-hidden="true">
                    {levels.map((height, i) => (
                      <WaveformBar key={i} height={height} active />
                    ))}
                  </div>
                  <Button variant="dark" onClick={onStop}>
                    {t('conversationStage.stop')}
                  </Button>
                </>
              ) : null}

              {recorderState === 'recorded' ? (
                <div className="cds-conversation-stage-review">
                  <Button variant="ghost" onClick={onPlay}>
                    {t('conversationStage.play')}
                  </Button>
                  <Button variant="ghost" onClick={onRerecord}>
                    {t('conversationStage.again')}
                  </Button>
                </div>
              ) : null}
            </div>

            {typedAnswer !== undefined ? (
              <div className="cds-conversation-stage-typed">
                <p className="cds-conversation-stage-typed-hint">
                  {t('conversationStage.typedHint')}
                </p>
                {typedAnswer}
              </div>
            ) : null}
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
