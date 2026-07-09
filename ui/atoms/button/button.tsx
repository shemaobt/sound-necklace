import type { ReactNode } from 'react';
import './button.css';

/**
 * Botão Shemá (redesign §4.1): primário telha, escuro/cordão e fantasma.
 * O press escurece para o telha-profundo — nunca clareia.
 */
export function Button({
  variant = 'primary',
  size = 'lg',
  disabled = false,
  onClick,
  children,
}: {
  variant?: 'primary' | 'dark' | 'ghost';
  size?: 'sm' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="cds-button"
      data-variant={variant}
      data-size={size}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
