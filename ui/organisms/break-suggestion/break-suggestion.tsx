import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../atoms';
import './break-suggestion.css';

/**
 * A pausa sugerida (ENG-650; protótipo v4 "PAUSA SUGERIDA", linhas 856-869/1022).
 * Depois de um bom tempo de trabalho o app SUGERE descansar — e é só isso: não
 * bloqueia nada, os dois botões dispensam, e a sessão fica salva de qualquer jeito.
 *
 * UMA vez por sessão. O latch é o estado interno: montado por sessão (o shell dá
 * `key={sessionId}` à vista da sessão), começar, retomar ou reabrir para revisão
 * remonta e rearma; dispensada, ela não volta, tenha sido por qual botão for.
 *
 * Não sobe por cima de nada em curso. O relógio é um POLL, e não um despertador
 * único, exatamente como no protótipo: enquanto `busy` for verdade nenhum passo
 * roda, e quando a pressa passa o primeiro passo vem um fôlego depois — a
 * sugestão não é engolida pela gravação nem cai em cima da tela seguinte no
 * instante em que ela aparece.
 */

/** O limiar: 45 minutos de sessão aberta (protótipo `pausaAposMin`, default 45). */
export const BREAK_AFTER_MS = 45 * 60_000;

/**
 * Passo do relógio (protótipo: 4 s). É também o fôlego entre uma gravação
 * terminar e a sugestão aparecer — quem acabou de falar pousa na tela antes.
 */
export const BREAK_SETTLE_MS = 4_000;

export interface BreakSuggestionProps {
  /**
   * Há algo em curso que não pode ser interrompido — o microfone aberto, ou outra
   * tela cheia no ar (a meta alcançada, ENG-653). As demais superfícies do
   * protótipo entram por aqui quando existirem; a tela de espera já é estrutural,
   * porque substitui a vista da sessão inteira e desmonta esta sugestão junto.
   */
  busy: boolean;
  /** Guardar e descansar: o shell leva ao painel; a sessão fica salva. */
  onTakeBreak: () => void;
  /**
   * Abriu ou fechou. A exclusão entre telas cheias é de MÃO DUPLA (ENG-653): o
   * `busy` acima impede que esta suba por cima das outras, e este aviso é como o
   * shell impede que as outras subam por cima desta.
   */
  onOpenChange?: (open: boolean) => void;
}

export function BreakSuggestion({ busy, onTakeBreak, onOpenChange }: BreakSuggestionProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'armed' | 'open' | 'spent'>('armed');
  // marcado no primeiro efeito, não no render: ler o relógio ao renderizar é
  // impuro, e o React pode renderizar de novo sem que a sessão tenha recomeçado
  const startedAt = useRef<number | null>(null);
  const keepGoingRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const start = (startedAt.current ??= Date.now());
    if (phase !== 'armed' || busy) return;
    const timer = setInterval(() => {
      if (Date.now() - start >= BREAK_AFTER_MS) setPhase('open');
    }, BREAK_SETTLE_MS);
    return () => clearInterval(timer);
  }, [phase, busy]);

  const open = phase === 'open';
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  if (!open) return null;

  /** Fechar sem sair — o destino de "Seguir mais um pouco", do Esc e do latch. */
  const keepGoing = (): void => setPhase('spent');

  return (
    <Dialog.Root
      open
      // Esc (e qualquer outra dispensa do Radix) é SEMPRE ficar: sair sem querer
      // pelo teclado tiraria a pessoa da pergunta em que ela estava.
      onOpenChange={(open) => (open ? undefined : keepGoing())}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="cds-break-scrim" />
        <Dialog.Content
          className="cds-break"
          // foco na ação que não leva ninguém embora (APG; §9.5)
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            keepGoingRef.current?.querySelector('button')?.focus();
          }}
        >
          <div className="cds-break-column">
            <span className="cds-break-beads" aria-hidden="true">
              {/* contas até aqui, a de agora respirando, contas por vir */}
              <span className="cds-break-bead" />
              <span className="cds-break-bead" />
              <span className="cds-break-bead" />
              <span className="cds-break-bead" />
              <span className="cds-break-bead" />
            </span>
            <Dialog.Title className="cds-break-headline">
              {t('breakSuggestion.headline')}
            </Dialog.Title>
            <Dialog.Description className="cds-break-body">
              {t('breakSuggestion.body')}
            </Dialog.Description>
            <div className="cds-break-actions">
              <span className="cds-break-action" data-kind="take">
                <Button
                  variant="ghost"
                  onClick={() => {
                    keepGoing();
                    onTakeBreak();
                  }}
                >
                  {t('breakSuggestion.take')}
                </Button>
              </span>
              <span className="cds-break-action" data-kind="keep" ref={keepGoingRef}>
                <Button variant="ghost" onClick={keepGoing}>
                  {t('breakSuggestion.keepGoing')}
                </Button>
              </span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
