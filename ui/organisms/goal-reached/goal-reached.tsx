import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../atoms';
import './goal-reached.css';

/**
 * A meta de hoje alcançada (ENG-653; protótipo v4 "META ALCANÇADA", linhas
 * 870-883/1030). Os dois chegaram onde tinham combinado chegar: o app diz isso,
 * toca a nota de subir de etapa e oferece guardar — sem obrigar. "Seguir mais um
 * pouco" é a ação em destaque, porque parar já é o default de quem quer parar.
 *
 * UMA vez por sessão, como a pausa sugerida (ENG-650). O único estado é o "já
 * dispensei": estar aberta é DERIVADO no render (a meta alcançada, nada em curso, e
 * ainda não dispensada), e não um terceiro estado que um efeito precise ligar —
 * abrir por `setState` dentro de efeito é cascata de render, e o lint reprova com
 * razão. O shell remonta esta tela por sessão (`key={sessionId}`), então começar,
 * retomar ou reabrir para revisão rearma; a meta em si sobrevive à troca de tela
 * (mora no `goalStore`) porque é escolhida no Setup, antes de a sessão existir.
 *
 * Não sobe por cima de nada em curso: enquanto `busy` for verdade a tela não abre —
 * e, quando a pressa passa, ela abre no render seguinte, sem exigir que a barra
 * cruze a marca outra vez. É a mesma guarda do protótipo, que reavalia a cada
 * atualização em vez de disparar num instante só.
 */

export interface GoalReachedProps {
  /** O progresso já alcançou a meta de hoje (quem compara é a barra do topo). */
  reached: boolean;
  /**
   * Há algo em curso que não pode ser interrompido: o microfone aberto ou outra
   * tela cheia no ar. Uma superfície cheia de cada vez.
   */
  busy: boolean;
  /** Toca ao abrir — o `advance` do UiSound, já mudo se o cabeçalho estiver mudo. */
  chime: () => void;
  /** Abriu ou fechou: é assim que o shell impede que outra tela cheia suba junto. */
  onOpenChange: (open: boolean) => void;
  /** "Guardar por hoje": o shell leva ao painel; a sessão fica salva. */
  onStopForToday: () => void;
}

export function GoalReached({
  reached,
  busy,
  chime,
  onOpenChange,
  onStopForToday,
}: GoalReachedProps) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const keepGoingRef = useRef<HTMLSpanElement>(null);
  const chimed = useRef(false);

  const open = reached && !busy && !dismissed;

  // a nota soa UMA vez, na primeira abertura — o ref, e não a dependência, é o que
  // garante isso: `chime` chega do shell com identidade nova a cada render dele
  useEffect(() => {
    if (!open || chimed.current) return;
    chimed.current = true;
    chime();
  }, [open, chime]);

  useEffect(() => {
    onOpenChange(open);
  }, [open, onOpenChange]);

  if (!open) return null;

  /** Fechar sem sair — o destino de "Seguir mais um pouco", do Esc e do latch. */
  const keepGoing = (): void => setDismissed(true);

  return (
    <Dialog.Root
      open
      // Esc (e qualquer outra dispensa do Radix) é SEMPRE ficar: sair sem querer
      // pelo teclado tiraria a pessoa da pergunta em que ela estava.
      onOpenChange={(next) => (next ? undefined : keepGoing())}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="cds-goal-scrim" />
        <Dialog.Content
          className="cds-goal"
          // foco na ação que não leva ninguém embora (APG; §9.5)
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            keepGoingRef.current?.querySelector('button')?.focus();
          }}
        >
          <div className="cds-goal-column">
            <span className="cds-goal-beads" aria-hidden="true">
              {/* as contas do trecho combinado, a última fechando o bloco */}
              <span className="cds-goal-bead" />
              <span className="cds-goal-bead" />
              <span className="cds-goal-bead" />
              <span className="cds-goal-bead" />
            </span>
            <Dialog.Title className="cds-goal-headline">{t('goalReached.headline')}</Dialog.Title>
            <Dialog.Description className="cds-goal-body">
              {t('goalReached.body')}
            </Dialog.Description>
            <div className="cds-goal-actions">
              <span className="cds-goal-action" data-kind="keep" ref={keepGoingRef}>
                <Button variant="ghost" onClick={keepGoing}>
                  {t('goalReached.keepGoing')}
                </Button>
              </span>
              <span className="cds-goal-action" data-kind="stop">
                <Button
                  variant="ghost"
                  onClick={() => {
                    keepGoing();
                    onStopForToday();
                  }}
                >
                  {t('goalReached.stopForToday')}
                </Button>
              </span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
