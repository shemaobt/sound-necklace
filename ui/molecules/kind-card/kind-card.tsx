import type { PaletteEntry } from '../../tokens';
import './kind-card.css';

/**
 * Um cartão de tipo de cena da Triage (redesign §6.4): ponto de cor + rótulo
 * PT-BR (o valor inglês fica no title, revelado no hover). A variante none-fit
 * é o cartão tracejado "Nenhum se encaixa", sem cor. É um `radio` isolado: o
 * grupo de escolha única e o roving tabindex são orquestrados pelo organismo.
 */
/**
 * O ⌀ de "nenhum se encaixa" (protótipo pickNoneFit). SVG inline, nunca unicode: o
 * caractere cru herda peso, linha de base e largura de qualquer fonte que o
 * sistema tenha à mão — o traço não bate com o círculo tracejado em volta.
 */
function NoneFitGlyph() {
  return (
    <svg
      className="cds-kind-card-none-glyph-svg"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="7" />
      <path d="M7 17 17 7" />
    </svg>
  );
}

export function KindCard({
  label,
  en,
  tint,
  selected = false,
  tabbable,
  noneFit = false,
  onSelect,
}: {
  label: string;
  /** valor inglês do scene_kind — mostrado no title (hover), nunca traduzido */
  en?: string;
  /** cor do segmento; ausente na variante none-fit */
  tint?: PaletteEntry;
  selected?: boolean;
  /**
   * entra na ordem de tabulação (roving tabindex do grupo); padrão = selecionado.
   * O organismo que agrupa os cartões DEVE deixar exatamente um `tabbable` mesmo
   * sem seleção — senão o grupo inteiro fica inalcançável pelo teclado.
   */
  tabbable?: boolean;
  /** cartão tracejado "Nenhum se encaixa" */
  noneFit?: boolean;
  onSelect?: () => void;
}) {
  const isTabbable = tabbable ?? selected;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      title={en}
      data-selected={selected || undefined}
      data-variant={noneFit ? 'none-fit' : undefined}
      tabIndex={isTabbable ? 0 : -1}
      className="cds-kind-card"
      onClick={onSelect}
    >
      {tint && !noneFit ? (
        <span className="cds-kind-card-dot" aria-hidden="true" style={{ background: tint.base }} />
      ) : null}
      {noneFit ? (
        <span className="cds-kind-card-none-glyph" aria-hidden="true">
          <NoneFitGlyph />
        </span>
      ) : null}
      <span className="cds-kind-card-label">{label}</span>
    </button>
  );
}
