import type { PaletteEntry } from '../../tokens';
import './scene-pearl.css';

/**
 * A pérola de cena da Rever (ENG-725; desenho docs/design/revisao-tela-nova.html, `_confFill`):
 * uma pérola de 42px com o nome do tipo embaixo. A confiança não é um disco ao
 * lado — é o PREENCHIMENTO da própria pérola: cheia (certeza), meia (quase),
 * tracejada (na dúvida) e creme tracejada para a cena que ficou fora dos tipos.
 * A escolhida ganha um anel. Presentacional: a cópia chega por prop, o toque sai.
 */

export type ScenePearlFill = 'high' | 'medium' | 'low' | 'none';

export interface ScenePearlProps {
  /** O nome do tipo, já traduzido — é o nome do botão. */
  label: string;
  fill: ScenePearlFill;
  /** A cor da cena {base, lit, deep}; sem tint a pérola cai nos tokens de aveia. */
  tint?: PaletteEntry;
  selected?: boolean;
  onClick?: () => void;
}

/**
 * Só a pérola, sem nome nem toque: a mesma peça que a fila do panorama usa,
 * reaproveitada pela tela de conclusão (uma por cena, ENG-725). Decorativa.
 */
export function ScenePearlDisc({
  fill,
  tint,
  size = 42,
}: {
  fill: ScenePearlFill;
  tint?: PaletteEntry;
  /** diâmetro em px — 42 na fila, 26 na tela de conclusão */
  size?: number;
}) {
  return (
    <span
      className="cds-scene-pearl-disc"
      aria-hidden="true"
      data-fill={fill}
      style={{
        '--cds-pearl-base': tint?.base,
        '--cds-pearl-lit': tint?.lit,
        '--cds-scene-pearl-size': `${size}px`,
      }}
    />
  );
}

export function ScenePearl({ label, fill, tint, selected = false, onClick }: ScenePearlProps) {
  return (
    <button
      type="button"
      className="cds-scene-pearl"
      data-fill={fill}
      data-selected={selected || undefined}
      onClick={onClick}
    >
      <ScenePearlDisc fill={fill} tint={tint} />
      <span className="cds-scene-pearl-name">{label}</span>
    </button>
  );
}
