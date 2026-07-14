import type { PaletteEntry } from '../../tokens';
import './progress-dots.css';

/** Estado visual de uma cena no fio de pontos (protótipo tDots). */
export interface ProgressDotScene {
  state: 'tagged' | 'none_fit' | 'pending';
  /** cor da cena (scenePalette); ausente = ponto neutro */
  tint?: PaletteEntry;
}

/**
 * Pontos de progresso da Triagem (Protótipo.dc.html, tDots): uma pérola por
 * cena — taggeada = pérola da cor da cena com check branco; none_fit = a mesma
 * pérola esmaecida; pendente = aro vazio. A atual é maior (30px) e ganha o halo
 * telha. Sem números — cada ponto é um botão nomeado genericamente (§9.2), o
 * atual anunciado com `aria-current="step"`.
 */
export function ProgressDots({
  count,
  current,
  scenes,
  onSelect,
  dotLabel = 'ir para a cena',
  groupLabel = 'cenas',
}: {
  count: number;
  /** índice da cena em foco */
  current: number;
  /** estado/cor por cena; ausente = todos pendentes neutros */
  scenes?: readonly ProgressDotScene[];
  onSelect?: (index: number) => void;
  /** nome acessível de cada ponto (digit-free) */
  dotLabel?: string;
  /** nome acessível do grupo de pontos (digit-free) */
  groupLabel?: string;
}) {
  return (
    <div className="cds-progress-dots" role="group" aria-label={groupLabel}>
      {Array.from({ length: count }, (_, i) => {
        const scene = scenes?.[i];
        const state = scene?.state ?? 'pending';
        const tint = scene?.tint;
        const style =
          state === 'pending'
            ? tint && i === current
              ? { borderColor: tint.base }
              : undefined
            : tint
              ? {
                  background: `radial-gradient(circle at 34% 30%, ${tint.lit} 0%, ${tint.base} 70%)`,
                }
              : undefined;
        return (
          <button
            key={i}
            type="button"
            className="cds-progress-dots-dot"
            aria-label={dotLabel}
            aria-current={i === current ? 'step' : undefined}
            data-current={i === current || undefined}
            data-state={state}
            style={style}
            onClick={() => onSelect?.(i)}
          >
            {state === 'tagged' ? (
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#F6F5EB"
                strokeWidth={3.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
