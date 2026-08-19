import * as Dialog from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../atoms';
import './pending-drafts-dialog.css';

/**
 * Sair da revisão com transcrição por confirmar (§8.7/§8.8).
 *
 * A regra não é deste diálogo: é o gate `reportExportStatus` (@/contracts/relatorio,
 * ENG-327) que recusa guardar enquanto houver resposta GRAVADA sem texto confirmado
 * — a célula do relatório é só texto, então guardar assim publicaria "_(no answer)_"
 * no lugar do que a pessoa disse. Este diálogo não decide nada e não conta nada por
 * conta própria: ele recebe o MESMO `pendingSlots` do gate e o diz uma tela antes,
 * onde ainda dá para resolver. Sem ele o aviso só chegava na Export, diante de um
 * botão morto.
 *
 * Deixa passar de propósito (§9.5 — avisar, nunca trancar): quem quiser baixar o
 * manifesto ou só ver a tela seguinte tem o que fazer lá. Quem confirma é que
 * destrava o guardar, e isso continua sendo verdade do outro lado.
 *
 * Desde a ENG-512 ele também OFERECE a saída, em vez de só apontá-la: a confirmação
 * em lote do relatório entra aqui como ação, sem que ninguém precise voltar e procurar
 * o botão no topo da lista. É a ação de lá — a que reconfere a elegibilidade dentro da
 * transação —, chegando por ponteiro; este arquivo não sabe confirmar nada.
 *
 * O foco inicial vai para a saída MENOS destrutiva — revisar —, de modo que um
 * Enter distraído nunca seja o que leva a sessão adiante nem o que aceita de uma vez
 * centenas de textos de máquina.
 */

/** O que a confirmação em lote fez — contado depois de escrever, nunca a partir do plano. */
export interface BulkOutcome {
  confirmed: number;
  remaining: number;
}

export interface PendingDraftsDialogProps {
  /** Quantas respostas gravadas ainda esperam texto confirmado — o número do gate. */
  pending: number;
  /**
   * Quantas dessas o lote consegue aceitar: as que TÊM transcrição guardada e a célula
   * ainda vazia. Não é `pending` — uma gravação sem transcrição está no gate e não
   * aqui —, e é por isso que aceitar tudo pode não zerar o aviso. Zero ⇒ a ação some:
   * um botão que não faria nada é uma promessa falsa, a mesma escolha que a ação em
   * lote já faz no topo da revisão.
   */
  confirmable: number;
  /** Depois de aceitar: o que de fato foi confirmado e o que sobrou. Nulo antes disso. */
  outcome: BulkOutcome | null;
  onConfirmAll: () => void;
  onReview: () => void;
  onProceed: () => void;
}

export function PendingDraftsDialog({
  pending,
  confirmable,
  outcome,
  onConfirmAll,
  onReview,
  onProceed,
}: PendingDraftsDialogProps) {
  const { t } = useTranslation();
  const reviewRef = useRef<HTMLDivElement>(null);
  // as que o lote NÃO alcança: gravadas sem transcrição nenhuma, que só o texto escrito
  // à mão resolve. Dizê-lo antes é o que impede a ação de prometer o que não cumpre.
  const beyondBulk = Math.max(0, pending - confirmable);

  return (
    <Dialog.Root open onOpenChange={(open) => (open ? undefined : onReview())}>
      <Dialog.Portal>
        <Dialog.Overlay className="cds-pending-drafts-overlay" />
        <Dialog.Content
          className="cds-pending-drafts"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            reviewRef.current?.querySelector('button')?.focus();
          }}
        >
          <Dialog.Title className="cds-pending-drafts-title">
            {outcome
              ? t('conversation.pendingDrafts.leftTitle', { count: outcome.remaining })
              : t('conversation.pendingDrafts.title', { count: pending })}
          </Dialog.Title>
          <Dialog.Description className="cds-pending-drafts-body">
            {outcome
              ? outcome.confirmed > 0
                ? t('conversation.pendingDrafts.confirmed', { count: outcome.confirmed })
                : t('conversation.pendingDrafts.confirmedNone')
              : t('conversation.pendingDrafts.body')}
          </Dialog.Description>
          {outcome ? (
            <p className="cds-pending-drafts-body">
              {t('conversation.pendingDrafts.leftBody', { count: outcome.remaining })}
            </p>
          ) : confirmable > 0 ? (
            <p className="cds-pending-drafts-body">
              {t('conversation.pendingDrafts.bulkNote')}
              {beyondBulk > 0
                ? ` ${t('conversation.pendingDrafts.bulkPartial', { count: beyondBulk })}`
                : ''}
            </p>
          ) : null}
          <div className="cds-pending-drafts-actions">
            <div ref={reviewRef} style={{ display: 'contents' }}>
              <Button onClick={onReview}>{t('conversation.pendingDrafts.review')}</Button>
            </div>
            {/* Depois de aceitar não se aceita de novo: o que sobrou não tem transcrição
                e nenhum clique aqui o resolveria. */}
            {!outcome && confirmable > 0 ? (
              <Button variant="ghost" size="sm" onClick={onConfirmAll}>
                {t('conversation.pendingDrafts.confirmAll', { count: confirmable })}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onProceed}>
              {t('conversation.pendingDrafts.anyway')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default PendingDraftsDialog;
