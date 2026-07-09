import { Pearl } from '../../atoms';
import type { PaletteEntry } from '../../tokens';
import './kind-card.css';

/**
 * Um cartão de tipo de cena da Triagem (redesign §6.4): ponto de cor + rótulo
 * PT-BR (o valor inglês fica no title, revelado no hover). A variante none-fit
 * é o cartão tracejado "Nenhum se encaixa", sem cor. É um `radio` isolado: o
 * grupo de escolha única e o roving tabindex são orquestrados pelo organismo.
 */
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
  /** entra na ordem de tabulação (roving tabindex do grupo); padrão = selecionado */
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
      {tint && !noneFit ? <Pearl tint={tint} size={22} state="lit" /> : null}
      <span className="cds-kind-card-label">{label}</span>
    </button>
  );
}
