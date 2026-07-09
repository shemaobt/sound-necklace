import './progress-dots.css';

/**
 * Pontos de progresso da Triagem (redesign §6.4): um ponto por cena que também
 * é atalho de salto. Sem números — cada ponto é um botão nomeado genericamente
 * (§9.2), o atual anunciado com `aria-current="step"`.
 */
export function ProgressDots({
  count,
  current,
  onSelect,
  dotLabel = 'ir para a cena',
}: {
  count: number;
  /** índice da cena em foco */
  current: number;
  onSelect?: (index: number) => void;
  /** nome acessível de cada ponto (digit-free) */
  dotLabel?: string;
}) {
  return (
    <div className="cds-progress-dots" role="group">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          className="cds-progress-dots-dot"
          aria-label={dotLabel}
          aria-current={i === current ? 'step' : undefined}
          data-current={i === current || undefined}
          onClick={() => onSelect?.(i)}
        />
      ))}
    </div>
  );
}
