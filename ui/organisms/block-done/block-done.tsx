import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Pearl } from '../../atoms';
import { ShemaIcon, type PaletteEntry } from '../../tokens';
import './block-done.css';

/**
 * A tela de fim de bloco (ENG-651; protótipo v4 "FIM DE BLOCO", linhas 842-855).
 * Nos DOIS limites estruturais do fluxo — a triagem fechando, a segmentação
 * fechando — uma tela marca que um bloco terminou antes do próximo começar.
 *
 * Não é contador nem relógio: quem a abre é o ato de confirmar, e por isso o
 * componente não guarda tempo nenhum. `block` chega do shell, que sabe QUE limite
 * acabou de ser cruzado; `null` não desenha nada.
 *
 * A estação seguinte já está atrás desta tela. Daí o lado seguro aqui ser o
 * CONTRÁRIO do da pausa sugerida: o primário continua (não leva ninguém embora), e
 * é nele que o foco abre e para onde o Esc vai. `Guardar e descansar` é a única
 * saída, e ela exige um clique deliberado.
 *
 * No limite que FECHA o fluxo não há estação atrás da tela nem para onde continuar
 * (ENG-689): quem monta omite o `onRest` e a tela fica com uma ação só — o
 * primário, que ali é a própria saída. Duas ações para o mesmo destino não são uma
 * escolha, são uma dúvida.
 */

/** Qual bloco fechou — o nome da estação que termina, não a que começa. */
export type ClosedBlock = 'triagem' | 'segmentacao';

/** Cinco contas, como no protótipo; a última fecha o fio (quadrada). */
const BEADS = 5;

export interface BlockDoneProps {
  /** O bloco que acabou de fechar; `null` = nada na tela. */
  block: ClosedBlock | null;
  /**
   * As cores das contas, vindas dos dados e não de literais: a paleta de frases
   * depois da Segmentação, as cores das próprias cenas depois da Triagem. Menos
   * cores que contas ciclam; vazio cai nos tokens de pérola-aveia.
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
  /** O primário: seguir para a estação já chegada. Também o destino do Esc. */
  onContinue: () => void;
  /**
   * Guardar e descansar: o shell leva ao painel; a sessão fica salva. Omitido, a
   * tela não mostra a segunda ação — ver o cabeçalho do módulo.
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
  const continueRef = useRef<HTMLSpanElement>(null);

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
      // Esc (e qualquer outra dispensa do Radix) CONTINUA: fechar por engano no
      // teclado não pode custar a estação que a pessoa acabou de alcançar.
      onOpenChange={(open) => (open ? undefined : onContinue())}
    >
      <Dialog.Portal>
        <Dialog.Content
          className="cds-block-done"
          // foco na ação que não leva ninguém embora (APG; §9.5) — aqui, o primário
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            continueRef.current?.querySelector('button')?.focus();
          }}
        >
          <span className="cds-block-done-watermark" aria-hidden="true">
            <ShemaIcon colorway="branco" size={340} />
          </span>
          <p className="cds-block-done-eyebrow">{t('blockDone.eyebrow')}</p>
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
          <div className="cds-block-done-actions">
            <span
              className="cds-block-done-action"
              data-kind="continue"
              // a ÚNICA ação dominante da tela, declarada como nas estações (§9.2)
              data-role="primary-action"
              ref={continueRef}
            >
              <Button variant="ghost" onClick={onContinue}>
                {t(`blockDone.${block}.primary`)}
              </Button>
            </span>
            {onRest ? (
              <span className="cds-block-done-action" data-kind="rest">
                <Button variant="ghost" onClick={onRest}>
                  {t('blockDone.rest')}
                </Button>
              </span>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
