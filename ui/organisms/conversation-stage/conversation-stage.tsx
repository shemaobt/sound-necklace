import { useTranslation } from 'react-i18next';

import { Button, WaveformBar } from '../../atoms';
import { BeadRow, type BeadCell, QuestionCard } from '../../molecules';
import { StorytellerGuide } from '../storyteller-guide';
import './conversation-stage.css';

/**
 * Estado da resposta em voz — a máquina vive na página; o organismo só a desenha.
 * `saving`: entre o toque de parar e a persistência confirmada (o PUT embutido no
 * stop, ENG-318) — o estado vive no botão: spinner, sem aceitar clique.
 */
export type RecorderState = 'idle' | 'recording' | 'saving' | 'recorded';

/**
 * Barras da forma de onda (protótipo recBars). Exportado porque quem alimenta
 * `levels` precisa da MESMA contagem: capado abaixo disso, o rabo da onda ficava
 * congelado na fórmula de fallback enquanto o começo reagia à voz — o medidor
 * mentia justamente na tela cujo trabalho é mostrar "estamos te ouvindo".
 */
export const WAVE_BARS = 46;

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
  /** A resposta gravada está TOCANDO agora (eventos reais da porta) — ouvir ⇄ pausar (ENG-322). */
  answerPlaying?: boolean;
  /** Reprodução pedida e ainda abrindo (fetch+decode no modo real) — ENG-336. */
  answerOpening?: boolean;
  /** Pausa a reprodução da resposta (o clique do "pausar"). */
  onStopPlay?: () => void;
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

/** Arco girante do "guardando a resposta" (ENG-318); a rotação vive no CSS (reduced-motion-safe). */
function SavingGlyph() {
  return (
    <svg
      className="cds-conversation-stage-mic-glyph cds-conversation-stage-saving-glyph"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
    >
      <path d="M12 3a9 9 0 1 1-9 9" />
    </svg>
  );
}

/** Barras de pausa do "Pausar a pergunta" (ENG-317), irmão do SpeakGlyph. */
function PauseGlyph() {
  return (
    <svg
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="6" y="5" width="4" height="14" rx="1.5" />
      <rect x="14" y="5" width="4" height="14" rx="1.5" />
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
  answerPlaying = false,
  answerOpening = false,
  onStopPlay,
  progress,
  onPrev,
  onNext,
  onSpeakQuestion,
  speaking = false,
}: ConversationStageProps) {
  const { t } = useTranslation();
  // protótipo thread: respondidas/passadas 15px, a atual 22px com halo (CSS).
  // O protótipo mostra 11 perguntas; o roteiro real passa de 40 — SEM janela
  // (ENG-329): a janela cravava o cursor no centro e o fio parecia congelado no
  // meio da entrevista (padrão idêntico a cada avanço). Todas as perguntas ficam
  // no fio; roteiros longos encolhem as contas (o §9.2 pede caber sem scroll).
  const density = progress.total > 52 ? 'dense' : progress.total > 23 ? 'compact' : null;
  const headSize = density === 'dense' ? 10 : density === 'compact' ? 12 : 22;
  const beadSize = density === 'dense' ? 4 : density === 'compact' ? 7 : 15;
  const beads: BeadCell[] = Array.from({ length: progress.total }, (_, i) => {
    return {
      key: i,
      state:
        i === progress.current
          ? 'head'
          : // protótipo: `i < qIndex || answers[i]` — o fio conta o caminho ANDADO,
            // não só o que ficou gravado. Sem o `i < current` nada acendia: a
            // entrevista é só-voz e `answered` enumera apenas respostas de texto.
            i < progress.current || progress.answered.has(i)
            ? 'lit'
            : 'unplayed',
      size: i === progress.current ? headSize : beadSize,
    } satisfies BeadCell;
  });

  return (
    <div className="cds-conversation-stage">
      <div className="cds-conversation-stage-main">
        <div className="cds-conversation-stage-guide">
          <StorytellerGuide speaking={speaking} />
          {onSpeakQuestion ? (
            // o botão segue o estado REAL da fala (ENG-317): falando oferece pausar
            <button
              type="button"
              className="cds-conversation-stage-speak"
              onClick={onSpeakQuestion}
            >
              {speaking ? <PauseGlyph /> : <SpeakGlyph />}
              {speaking ? t('conversationStage.pause') : t('conversationStage.listen')}
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
              {recorderState === 'idle' ? (
                // sem resposta ainda, o protótipo promete o fio de som em palavras —
                // barras chapadas aqui viravam um traço morto espremendo o microfone
                <p className="cds-conversation-stage-empty-wave">
                  {t('conversationStage.emptyWave')}
                </p>
              ) : (
                <div className="cds-conversation-stage-waveform" aria-hidden="true">
                  {recorderState === 'recording'
                    ? // barras vivas: nível real quando o gravador o emite; senão a
                      // altura formulaica do protótipo (recBars: 10 + (i*7 % 34))
                      Array.from({ length: WAVE_BARS }, (_, i) => (
                        <WaveformBar key={i} height={levels[i] ?? 10 + ((i * 7) % 34)} active />
                      ))
                    : // reproduzindo a resposta, as barras acendem (ENG-322)
                      Array.from({ length: WAVE_BARS }, (_, i) => (
                        <WaveformBar key={i} height={10 + ((i * 7) % 34)} active={answerPlaying} />
                      ))}
                </div>
              )}

              {recorderState === 'recorded' ? (
                <div className="cds-conversation-stage-review">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={answerOpening}
                    onClick={answerPlaying ? onStopPlay : onPlay}
                  >
                    {answerOpening
                      ? t('conversationStage.openingAnswer')
                      : answerPlaying
                        ? t('conversationStage.pausePlayback')
                        : t('conversationStage.play')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onRerecord}>
                    {t('conversationStage.again')}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="cds-conversation-stage-recorder" data-state={recorderState}>
              {/* o microfone nunca some (protótipo toggleRecord): escondê-lo com a
                  resposta pronta deixava "Toque e fale a sua resposta" mandando
                  tocar num botão que não estava mais lá */}
              <button
                type="button"
                className="cds-conversation-stage-mic"
                data-recording={recorderState === 'recording' || undefined}
                disabled={recorderState === 'saving'}
                aria-label={
                  recorderState === 'recording'
                    ? t('conversationStage.stop')
                    : recorderState === 'saving'
                      ? t('conversationStage.saving')
                      : t('conversationStage.record')
                }
                onClick={recorderState === 'recording' ? onStop : onRecord}
              >
                {recorderState === 'recording' ? (
                  <StopGlyph />
                ) : recorderState === 'saving' ? (
                  <SavingGlyph />
                ) : (
                  <MicGlyph />
                )}
              </button>

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
          data-density={density ?? undefined}
          role="group"
          aria-label={t('conversationStage.progressAria')}
        >
          <BeadRow beads={beads} />
        </div>
      </div>
    </div>
  );
}
