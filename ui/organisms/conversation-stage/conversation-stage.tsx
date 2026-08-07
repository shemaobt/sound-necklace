import * as Dialog from '@radix-ui/react-dialog';
import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, WaveformBar } from '../../atoms';
import { ConversationProgressBar, type ConversationTrecho, QuestionCard } from '../../molecules';
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
  /** pergunta em foco */
  current: number;
}

export interface ConversationStageProps {
  question: string;
  /**
   * Cabeçalho do painel, acima da pergunta (protótipo): o indicador de trecho
   * (bolinha + eyebrow do bloco) + o ▶ que toca o áudio do trecho. Ligado ao
   * player pela página; o organismo só reserva o lugar.
   */
  header?: ReactNode;
  /** pergunta conduzida pela facilitadora — mostra o marcador de papel */
  facilitatorLed?: boolean;
  recorderState: RecorderState;
  /** alturas (px) das barras da forma de onda ao vivo; a página as atualiza durante a gravação */
  levels?: number[];
  onRecord?: () => void;
  onStop?: () => void;
  onPlay?: () => void;
  /**
   * Descartar a resposta gravada e JÁ começar outra — uma intenção, um toque
   * (ENG-392). Só é chamado depois da confirmação: o organismo é o portão.
   */
  onRerecord?: () => void;
  /**
   * Duração da resposta já gravada. A confirmação de regravar diz em voz alta o
   * que está em risco; sem ela a pergunta é abstrata e a pessoa aceita no reflexo.
   */
  /**
   * O tamanho da resposta em risco, JÁ por extenso ("cerca de um minuto").
   * Chega pronto porque o §9.2 proíbe dígito em tela de ouvinte e quem sabe
   * escrever número por palavra é a página (`cardinal`, no idioma da UI).
   * Ausente = não deu para saber; o corpo do diálogo omite o tamanho.
   */
  answerLength?: string;
  /**
   * Um controle travado foi tocado durante a gravação (ENG-393). A recusa se
   * responde ao ouvido, não com texto (§9.4) — quem liga a porta de som decide o
   * que tocar; o organismo não conhece adapter.
   */
  onBlocked?: () => void;
  /** A resposta gravada está TOCANDO agora (eventos reais da porta) — ouvir ⇄ pausar (ENG-322). */
  answerPlaying?: boolean;
  /** Reprodução pedida e ainda abrindo (fetch+decode no modo real) — ENG-336. */
  answerOpening?: boolean;
  /** Pausa a reprodução da resposta (o clique do "pausar"). */
  onStopPlay?: () => void;
  progress: ConversationProgress;
  /** os trechos da conversa (história · cenas · frases) para a barra de progresso */
  trechos: readonly ConversationTrecho[];
  onPrev?: () => void;
  onNext?: () => void;
  /** A pergunta está marcada como sem resposta — o botão do rodapé oferece desfazer. */
  skipped?: boolean;
  /**
   * Alterna a marca de "sem resposta" desta pergunta. Ausente = sem o botão. É ação da
   * facilitadora, não do ouvinte: fica no rodapé, junto da navegação, longe do microfone.
   */
  onToggleSkip?: () => void;
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
function MicGlyph({ className = 'cds-conversation-stage-mic-glyph' }: { className?: string }) {
  return (
    <svg
      className={className}
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
 * O palco da conversa do Conversation (redesign §6.6): guia à esquerda, a pergunta
 * grande em Merriweather à direita, a resposta por voz (microfone → forma de onda
 * ao vivo → ouvir/de novo) e, no rodapé, a barra de progresso por trecho
 * (história · cenas · frases, ENG-350), sem números (§9.2). Apresentacional: toda
 * a máquina de estados chega por props e sai por callbacks; o MediaRecorder vive
 * no adapter, ligado pela página.
 */
export function ConversationStage({
  question,
  header,
  facilitatorLed = false,
  recorderState,
  levels = [],
  onRecord,
  onStop,
  onPlay,
  onRerecord,
  answerLength,
  onBlocked,
  answerPlaying = false,
  answerOpening = false,
  onStopPlay,
  progress,
  trechos,
  onPrev,
  onNext,
  skipped = false,
  onToggleSkip,
  onSpeakQuestion,
  speaking = false,
}: ConversationStageProps) {
  const { t } = useTranslation();
  const [confirmingRerecord, setConfirmingRerecord] = useState(false);
  const keepRef = useRef<HTMLSpanElement>(null);

  /**
   * Microfone aberto: o resto da tela espera (ENG-393). Avançar, voltar, reouvir
   * a pergunta ou o trecho no meio de uma resposta corrompe ou perde o que a
   * pessoa está dizendo. A trava é DERIVADA do estado do gravador — assim ela se
   * levanta sozinha em toda saída, inclusive quando o salvamento falha.
   */
  const locked = recorderState === 'recording';
  /**
   * A recusa nunca é muda: quem está falando não está lendo a tela. Recusar no
   * próprio handler (e não só apagar o botão) é o que sobrevive a um DOM em
   * transição — é aqui que a gravação de fato se salva.
   */
  const guard = (run?: () => void) => (): void => {
    if (locked) {
      onBlocked?.();
      return;
    }
    run?.();
  };

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
              aria-disabled={locked || undefined}
              onClick={guard(onSpeakQuestion)}
            >
              {speaking ? <PauseGlyph /> : <SpeakGlyph />}
              {speaking ? t('conversationStage.pause') : t('conversationStage.listen')}
            </button>
          ) : null}
        </div>

        <div className="cds-conversation-stage-panel">
          {header ? (
            <div
              className="cds-conversation-stage-panel-header"
              data-waiting={locked || undefined}
              // o ▶ do trecho chega como ReactNode: não há handler para embrulhar,
              // então a recusa acontece na captura, antes do clique chegar a ele
              onClickCapture={(event) => {
                if (!locked) return;
                event.stopPropagation();
                onBlocked?.();
              }}
            >
              {header}
            </div>
          ) : null}

          <QuestionCard
            question={question}
            facilitatorLed={facilitatorLed}
            roleTitle={t('questionCard.roleTitle')}
          >
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
                  {/* regravar passa pela confirmação (ENG-392): um toque errado aqui
                      apagava, em silêncio, a história que a pessoa acabou de contar */}
                  <Button variant="ghost" size="sm" onClick={() => setConfirmingRerecord(true)}>
                    <MicGlyph className="cds-conversation-stage-rerecord-glyph" />
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
                  {locked ? (
                    <>
                      <span className="cds-conversation-stage-rec-dot" aria-hidden="true" />
                      {t('conversationStage.recordingLabel')}
                    </>
                  ) : (
                    t('conversationStage.idleHint')
                  )}
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
            <Button variant="ghost" size="sm" ariaDisabled={locked} onClick={guard(onPrev)}>
              {t('conversationStage.prev')}
            </Button>
          ) : null}
          {onToggleSkip ? (
            <Button variant="ghost" size="sm" ariaDisabled={locked} onClick={guard(onToggleSkip)}>
              {skipped ? t('conversationStage.unskip') : t('conversationStage.skip')}
            </Button>
          ) : null}
          {onNext ? (
            <Button variant="dark" size="sm" ariaDisabled={locked} onClick={guard(onNext)}>
              {t('conversationStage.next')}
            </Button>
          ) : null}
        </div>
        <div className="cds-conversation-stage-progress">
          <ConversationProgressBar
            trechos={trechos}
            current={progress.current}
            total={progress.total}
            ariaLabel={t('conversationStage.progressAria')}
          />
        </div>
      </div>

      {confirmingRerecord ? (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            // Esc, ou qualquer fechamento que não seja o "apagar", preserva a
            // gravação: o caminho de menor esforço é sempre o que não destrói (§9.5)
            if (!open) setConfirmingRerecord(false);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="cds-rerecord-confirm-overlay" />
            <Dialog.Content
              // alertdialog, e não dialog: é confirmação destrutiva — o corpo é
              // anunciado junto do título e clicar fora não decide nada
              role="alertdialog"
              className="cds-rerecord-confirm"
              onInteractOutside={(event) => event.preventDefault()}
              // foco na ação SEGURA (como o seam-modal): um Enter distraído mantém
              // a resposta em vez de apagá-la
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                keepRef.current?.querySelector('button')?.focus();
              }}
            >
              <Dialog.Title className="cds-rerecord-confirm-title">
                {t('conversationStage.rerecordTitle')}
              </Dialog.Title>
              <Dialog.Description className="cds-rerecord-confirm-body">
                {answerLength === undefined
                  ? // a duração pode não ter chegado (consulta de IO falha): dizer
                    // "0:00" mentiria sobre o tamanho do que se perde
                    t('conversationStage.rerecordBodyUnknown')
                  : t('conversationStage.rerecordBody', { duration: answerLength })}
              </Dialog.Description>
              <div className="cds-rerecord-confirm-actions">
                <span ref={keepRef} style={{ display: 'contents' }}>
                  <Button variant="primary" onClick={() => setConfirmingRerecord(false)}>
                    {t('conversationStage.rerecordKeep')}
                  </Button>
                </span>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setConfirmingRerecord(false);
                    onRerecord?.();
                  }}
                >
                  {t('conversationStage.rerecordConfirm')}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
    </div>
  );
}
