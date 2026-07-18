import './skeleton.css';

/**
 * Bloco de carregamento (ENG-308): um pulso quieto onde o conteúdo vai nascer —
 * o sistema nunca parece travado enquanto a API responde. Decorativo por
 * definição (`aria-hidden`); quem anuncia o carregamento é o dono da tela, com
 * um `role="status"` próprio. Sem movimento sob prefers-reduced-motion (§4.5).
 */
export function Skeleton({
  width,
  height,
  className,
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  return (
    <span
      className={className ? `cds-skeleton ${className}` : 'cds-skeleton'}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
