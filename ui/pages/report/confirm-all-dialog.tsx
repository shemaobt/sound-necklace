import * as Dialog from '@radix-ui/react-dialog';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../atoms';
import './confirm-all-dialog.css';

/**
 * Aceitar de uma vez todas as transcrições que esperam confirmação.
 *
 * Existe porque uma entrevista longa chega ao relatório com centenas de respostas
 * gravadas sem texto, e o gate de exportação (`reportExportStatus`, @/contracts/relatorio)
 * recusa guardar enquanto sobrar uma. O lote é o caminho POR DENTRO do gate: ele o
 * satisfaz confirmando, e o gate segue exatamente como estava — não há força, atalho
 * nem segundo clique que o empurre.
 *
 * O que este diálogo pede é uma confirmação HONESTA. Confirmar em lote não tira o
 * humano da regra do rascunho (CLAUDE.md §STT), mas troca o que ele atesta: um ato
 * deliberado aceitando N textos, em vez de N leituras. Então a cópia diz isso com
 * todas as letras — máquina escreveu, ninguém vai ler um a um, e isto vira a resposta
 * do documento — porque é a facilitadora que assume essa escolha.
 *
 * O foco inicial vai para "rever uma a uma": a saída que não escreve nada. Um Enter
 * distraído nunca deve ser o que aceita centenas de textos de máquina.
 */
export interface ConfirmAllDialogProps {
  /** Quantas respostas o lote vai confirmar — as que têm rascunho e ainda não têm texto. */
  pending: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmAllDialog({ pending, onCancel, onConfirm }: ConfirmAllDialogProps) {
  const { t } = useTranslation();
  const reviewRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog.Root open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <Dialog.Portal>
        <Dialog.Overlay className="cds-confirm-all-overlay" />
        <Dialog.Content
          className="cds-confirm-all"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            reviewRef.current?.querySelector('button')?.focus();
          }}
        >
          <Dialog.Title className="cds-confirm-all-title">
            {t('report.bulkTitle', { count: pending })}
          </Dialog.Title>
          <Dialog.Description className="cds-confirm-all-body">
            {t('report.bulkBody')}
          </Dialog.Description>
          <div className="cds-confirm-all-actions">
            <div ref={reviewRef} style={{ display: 'contents' }}>
              <Button size="sm" onClick={onCancel}>
                {t('report.bulkReview')}
              </Button>
            </div>
            {/* Aceitar não é o botão primário da tela: pesa como texto, não como bloco
                telha. Quem aceita centenas de textos de máquina precisa mirar. */}
            <button type="button" className="cds-confirm-all-accept" onClick={onConfirm}>
              {t('report.bulkAccept')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** O que o lote fez, e o que ficou faltando. */
export interface BulkResult {
  confirmed: number;
  remaining: number;
}

/**
 * A ação de confirmar tudo, com a sua pergunta e o seu resultado. Some inteira quando
 * não há nada elegível — um botão que não faria nada é uma promessa falsa.
 *
 * A região do resultado, ao contrário, fica montada e VAZIA desde o começo: uma
 * `role="status"` criada junto com o seu texto não é anunciada por leitor de tela.
 */
export function BulkConfirm({
  pending,
  result,
  onConfirm,
}: {
  pending: number;
  result: BulkResult | null;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);

  return (
    <>
      {pending > 0 ? (
        <div className="cds-report-bulk">
          <Button variant="ghost" size="sm" onClick={() => setAsking(true)}>
            {t('report.bulkAction')}
          </Button>
        </div>
      ) : null}
      <div
        className="cds-report-bulk-result"
        role="status"
        aria-live="polite"
        aria-label={t('report.bulkResultRegion')}
      >
        {result === null ? null : (
          <>
            <span>
              {result.confirmed > 0
                ? t('report.bulkConfirmed', { count: result.confirmed })
                : t('report.bulkNothing')}
            </span>
            {result.remaining > 0 ? (
              <span>{t('report.bulkRemaining', { count: result.remaining })}</span>
            ) : null}
          </>
        )}
      </div>
      {asking ? (
        <ConfirmAllDialog
          pending={pending}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            onConfirm();
            setAsking(false);
          }}
        />
      ) : null}
    </>
  );
}

export default ConfirmAllDialog;
