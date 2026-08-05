import type { PaletteEntry } from '../../tokens';
import './progress-dots.css';

/** Estado visual de uma cena no fio de pontos (protótipo tDots). */
export interface ProgressDotScene {
  state: 'tagged' | 'none_fit' | 'pending';
  /** cor da cena (scenePalette); ausente = ponto neutro */
  tint?: PaletteEntry;
}

/**
 * Pontos de progresso da Triage (Protótipo.dc.html, tDots): uma pérola por
 * cena — taggeada = pérola da cor da cena com o selo de check; none_fit = a
 * mesma pérola esmaecida; pendente = aro vazio. A atual é maior (30px) e ganha
 * o halo telha, e o atual é anunciado com `aria-current="step"`.
 *
 * Este indicador NUMERA as cenas — a única exceção ao digit-free do §9.2
 * (ENG-389, decisão do dono, 2026-08-04). Ele reusa a linguagem visual da conta
 * do colar, e na primeira validação o usuário o leu como "uma conta": não sabia
 * em que cena estava nem quais faltavam. Aqui o número é identidade da cena, não
 * contagem, e a exceção termina neste componente — a guarda de
 * `molecules/minimalism.test.tsx` segue valendo para todo o resto.
 *
 * O texto do número chega pronto em `dotLabel`: molécula não fala i18n
 * (dependency-cruiser barra), então quem chama monta "Cena N".
 */
export function ProgressDots({
  count,
  current,
  scenes,
  onSelect,
  dotLabel,
  groupLabel = 'cenas',
}: {
  count: number;
  /** índice da cena em foco */
  current: number;
  /** estado/cor por cena; ausente = todos pendentes neutros */
  scenes?: readonly ProgressDotScene[];
  onSelect?: (index: number) => void;
  /**
   * Nome acessível de cada ponto, por índice (ex.: i => `Cena ${i + 1}`).
   * OBRIGATÓRIO: sem ele o botão fica com o dígito nu por nome acessível — quem
   * ouve a tela receberia "um", "dois", sem saber do quê.
   */
  dotLabel: (index: number) => string;
  /** nome acessível do grupo de pontos (digit-free) */
  groupLabel?: string;
}) {
  return (
    <div className="cds-progress-dots" role="group" aria-label={groupLabel}>
      {Array.from({ length: count }, (_, i) => {
        const scene = scenes?.[i];
        const state = scene?.state ?? 'pending';
        const tint = scene?.tint;
        /* pendente carrega a cor da cena no aro E no número: é o que deixa o
           indicador falar a mesma língua do colar mesmo antes de classificar */
        const style =
          state === 'pending'
            ? tint
              ? { borderColor: tint.base, color: tint.base }
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
            aria-label={dotLabel(i)}
            aria-current={i === current ? 'step' : undefined}
            data-current={i === current || undefined}
            data-state={state}
            style={style}
            onClick={() => onSelect?.(i)}
          >
            {i + 1}
            {state === 'tagged' ? (
              /* selo fora do disco: o número é a identidade, o check é o estado —
                 empilhados eles brigavam pelo mesmo espaço de 22px */
              <span className="cds-progress-dots-badge">
                <svg
                  width={9}
                  height={9}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#F6F5EB"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
