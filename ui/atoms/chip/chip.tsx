import type { PaletteEntry } from '../../tokens';
import { Pearl } from '../pearl/pearl';
import './chip.css';

/**
 * Pílula de cena/frase (redesign §6.3): swatch-pérola opcional tingido pela
 * cor do segmento; variante tracejada para "nenhum se encaixa" (Triagem).
 */
export function Chip({
  label,
  swatch,
  selected,
  dashed = false,
  onClick,
}: {
  label: string;
  /** cor do segmento — presente, mostra o swatch-pérola */
  swatch?: PaletteEntry;
  /**
   * Chip selecionável (ex.: segmento em reprodução). Só passe a prop em chips
   * que alternam: com ela o chip anuncia-se como toggle (aria-pressed);
   * omitida, é botão de ação simples.
   */
  selected?: boolean;
  /** "nenhum se encaixa": tracejado, sem cor */
  dashed?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="cds-chip"
      data-selected={selected || undefined}
      data-variant={dashed ? 'dashed' : undefined}
      aria-pressed={selected}
      onClick={onClick}
    >
      {swatch ? <Pearl tint={swatch} size={18} state="lit" /> : null}
      <span className="cds-chip-label">{label}</span>
    </button>
  );
}
