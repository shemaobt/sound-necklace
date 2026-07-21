import './save-chip.css';

export type SaveStatus = 'saving' | 'saved';

/**
 * Selo de salvamento automático (design "novos componentes", card "Selo de
 * salvamento automático"): uma pílula que pisca "Salvando…" (ponto pulsante) a
 * cada mudança e volta a "Tudo salvo — pode sair e voltar" (✓). Confirma que dá
 * para fechar e continuar depois sem perder nada (§7.3). Presentacional: a copy
 * chega por prop; as cores vêm das variáveis de chrome (claro/escuro). Sem
 * `aria-live`: o texto fica legível sob demanda, mas não anuncia a cada gravação
 * (tela do ouvinte — nada de spinner gritando, §9.2).
 */
export function SaveChip({
  status,
  savingLabel,
  savedLabel,
}: {
  status: SaveStatus;
  savingLabel: string;
  savedLabel: string;
}) {
  const saving = status === 'saving';
  return (
    <div className="cds-save-chip" data-status={status}>
      {saving ? (
        <span className="cds-save-chip-dot" aria-hidden="true" />
      ) : (
        <svg
          className="cds-save-chip-check"
          width={15}
          height={15}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
      {saving ? savingLabel : savedLabel}
    </div>
  );
}
