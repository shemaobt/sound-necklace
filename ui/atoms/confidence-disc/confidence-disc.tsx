import './confidence-disc.css';

/**
 * Disco de confiança (redesign §4.4) — a forma carrega o significado:
 * cheio oliva = Certeza (alta) · meio dourado = Quase (média) ·
 * anel tracejado = Na dúvida (baixa). Com rótulo, anuncia-se como imagem;
 * sem, é decorativo (o texto vizinho assume a semântica).
 */
export function ConfidenceDisc({
  variant,
  label,
  size = 42,
}: {
  variant: 'filled' | 'half' | 'dashed';
  label?: string;
  size?: number;
}) {
  return (
    <span
      className="cds-confidence-disc"
      data-variant={variant}
      style={{ '--cds-disc-size': `${size}px` }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  );
}
