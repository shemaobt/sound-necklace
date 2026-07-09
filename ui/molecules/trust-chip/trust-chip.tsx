import type { ReactNode } from 'react';

import './trust-chip.css';

/**
 * Âncora de confiança do Setup (redesign §6.1): glifo de cadeado + a linha
 * fixada "Nada sai do seu navegador." Estática (não é botão) — a promessa de
 * privacidade fica sempre à vista. O texto chega como slot, sempre PT-BR.
 */
export function TrustChip({ children }: { children: ReactNode }) {
  return (
    <div className="cds-trust-chip">
      <svg
        className="cds-trust-chip-glyph"
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="4" y="10" width="16" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
      <span className="cds-trust-chip-line">{children}</span>
    </div>
  );
}
