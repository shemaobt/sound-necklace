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
  ariaDisabled = false,
  onClick,
  children,
}: {
  variant?: 'primary' | 'dark' | 'ghost';
  size?: 'sm' | 'lg';
  disabled?: boolean;
  /**
   * Indisponível AGORA, mas ainda alcançável pelo clique — para quem chama poder
   * responder à tentativa (o som de recusa, §9.4) em vez de engoli-la. O
   * `disabled` de verdade cala o botão: o dedo toca e não volta nada, nem som.
   */
  ariaDisabled?: boolean;
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
      aria-disabled={ariaDisabled || undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
