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
 * O foco inicial vai para a saída MENOS destrutiva — revisar —, de modo que um
 * Enter distraído nunca seja o que leva a sessão adiante.
 */
export interface PendingDraftsDialogProps {
  /** Quantas respostas gravadas ainda esperam texto confirmado — o número do gate. */
  pending: number;
  onReview: () => void;
  onProceed: () => void;
}

export function PendingDraftsDialog({ pending, onReview, onProceed }: PendingDraftsDialogProps) {
  const { t } = useTranslation();
  const reviewRef = useRef<HTMLDivElement>(null);

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
            {t('conversation.pendingDrafts.title', { count: pending })}
          </Dialog.Title>
          <Dialog.Description className="cds-pending-drafts-body">
            {t('conversation.pendingDrafts.body')}
          </Dialog.Description>
          <div className="cds-pending-drafts-actions">
            <div ref={reviewRef} style={{ display: 'contents' }}>
              <Button onClick={onReview}>{t('conversation.pendingDrafts.review')}</Button>
            </div>
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
