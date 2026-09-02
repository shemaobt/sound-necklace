import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Pearl } from '../../atoms';
import { ShemaIcon, type PaletteEntry } from '../../tokens';
import './block-done.css';

/**
 * A tela de fim de bloco (ENG-651; protótipo v4 "FIM DE BLOCO", linhas 842-855).
 * No limite da Triagem uma tela marca que um bloco terminou antes do próximo
 * começar; no fim da Rever (ENG-725) ela marca a história concluída.
 *
 * Não é contador nem relógio: quem a abre é o ato de confirmar, e por isso o
 * componente não guarda tempo nenhum. `block` chega do shell, que sabe QUE limite
 * acabou de ser cruzado; `null` não desenha nada.
 *
 * Na Triagem a estação seguinte já está atrás desta tela. Daí o lado seguro ali
 * ser o CONTRÁRIO do da pausa sugerida: o primário continua (não leva ninguém
 * embora), e é nele que o foco abre e para onde o Esc vai. `Guardar e descansar`
 * é a única saída, e ela exige um clique deliberado. Na história concluída é o
 * inverso: o primário É a saída, e quem fica é "Olhar de novo" — o foco e o Esc
 * vão para ela. A regra é uma só: o lado seguro é o que não leva ninguém embora.
 *
 * No fim da Rever (ENG-725) a tela marca a história concluída: o primário é a
 * saída (o painel), e a segunda ação não guarda nada — "Olhar de novo" devolve à
 * Rever, que continua montada atrás. Cada bloco traz o seu eyebrow e o rótulo da
 * sua segunda ação; quem monta pode ainda omitir o `onRest` e deixar a tela com
 * uma ação só.
 */

/**
 * Qual bloco fechou — o nome do que termina, não do que começa. A Segmentação
 * fechando deixou de ser um bloco desde a ENG-725: a Rever é a estação seguinte,
 * e é ela que fecha a história.
 */
export type ClosedBlock = 'triagem' | 'historia';

/** Cinco contas, como no protótipo; a última fecha o fio (quadrada). */
const BEADS = 5;

export interface BlockDoneProps {
  /** O bloco que acabou de fechar; `null` = nada na tela. */
  block: ClosedBlock | null;
  /**
   * As cores das contas, vindas dos dados e não de literais: as cores das próprias
   * cenas, nos dois blocos. Menos cores que contas ciclam; vazio cai nos tokens de
   * pérola-aveia.
   */
  tints: readonly PaletteEntry[];
  /**
   * Há algo em curso que não pode ser interrompido: o microfone aberto ou outra
   * tela cheia no ar. Uma superfície cheia de cada vez.
   *
   * ADIAR, NUNCA ENGOLIR: `block` é do shell e não se perde enquanto isto for
   * verdade — a tela só deixa de RENDERIZAR. Quando a pressa passa ela aparece no
   * render seguinte, sem exigir que o bloco feche outra vez (o que seria
   * impossível: um bloco fecha uma vez só).
   */
  busy?: boolean;
  /**
   * Abriu ou fechou. A exclusão entre telas cheias é de mão dupla (ENG-653): o
   * `busy` acima impede que esta suba por cima das outras, e este aviso é como o
   * shell impede que as outras subam por cima desta.
   */
  onOpenChange?: (open: boolean) => void;
  /** O primário: seguir para a estação já chegada (Triagem) ou sair (história). */
  onContinue: () => void;
  /**
   * A segunda ação — guardar e descansar na Triagem, olhar de novo na história
   * concluída. Omitido, a tela não mostra a segunda ação — ver o cabeçalho do módulo.
   */
  onRest?: () => void;
}

export function BlockDone({
  block,
  tints,
  busy = false,
  onOpenChange,
  onContinue,
  onRest,
}: BlockDoneProps) {
  const { t } = useTranslation();
  const actionsRef = useRef<HTMLDivElement>(null);

  // O lado seguro — a ação que NÃO leva ninguém embora — é o destino do Esc e do
  // foco inicial (APG; §9.5): o primário na Triagem, a segunda ação na história
  // concluída (ali o primário é a própria saída). Sem `onRest`, resta o primário.
  const staying = block === 'historia' && onRest ? 'rest' : 'continue';
  const stay = staying === 'rest' ? onRest! : onContinue;

  // DERIVADO no render, e não um estado que um efeito liga (mesma forma da meta
  // alcançada): é o que faz a espera ser adiamento e não perda — quando `busy`
  // cai, o render seguinte já mostra a tela.
  const open = block !== null && !busy;

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <Dialog.Root
      open
      // Esc (e qualquer outra dispensa do Radix) FICA: fechar por engano no
      // teclado não pode custar a estação que a pessoa acabou de alcançar — nem
      // tirá-la da Rever que acabou de concluir.
      onOpenChange={(open) => (open ? undefined : stay())}
    >
      <Dialog.Portal>
        <Dialog.Content
          className="cds-block-done"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            actionsRef.current
              ?.querySelector<HTMLButtonElement>(`[data-kind="${staying}"] button`)
              ?.focus();
          }}
        >
          <span className="cds-block-done-watermark" aria-hidden="true">
            <ShemaIcon colorway="branco" size={340} />
          </span>
          <p className="cds-block-done-eyebrow">{t(`blockDone.${block}.eyebrow`)}</p>
          <span className="cds-block-done-beads" aria-hidden="true">
            {Array.from({ length: BEADS }, (_, i) => (
              <Pearl
                key={i}
                state="lit"
                tint={tints.length > 0 ? tints[i % tints.length] : undefined}
                sceneEnd={i === BEADS - 1}
              />
            ))}
          </span>
          <Dialog.Title className="cds-block-done-headline">
            {t(`blockDone.${block}.headline`)}
          </Dialog.Title>
          <Dialog.Description className="cds-block-done-subtitle">
            {t(`blockDone.${block}.subtitle`)}
          </Dialog.Description>
          <div className="cds-block-done-actions" ref={actionsRef}>
            <span
              className="cds-block-done-action"
              data-kind="continue"
              // a ÚNICA ação dominante da tela, declarada como nas estações (§9.2)
              data-role="primary-action"
            >
              <Button variant="ghost" onClick={onContinue}>
                {t(`blockDone.${block}.primary`)}
              </Button>
            </span>
            {onRest ? (
              <span className="cds-block-done-action" data-kind="rest">
                <Button variant="ghost" onClick={onRest}>
                  {t(`blockDone.${block}.secondary`)}
                </Button>
              </span>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
