import type { ReactNode } from 'react';

import './connection-gate.css';

/**
 * Gate online-only (PRD §7.3/§13): quando a conexão cai, a edição pausa com um
 * aviso claro em PT-BR e o estado em memória é preservado — nada do que foi
 * digitado ou ancorado se perde. O bloqueio de fato das mutações vive no session
 * store (`apply` vira no-op offline); aqui está a affordance visual: o aviso e uma
 * cobertura sobre a superfície de edição. O playback client-side segue funcionando
 * porque o player itinerante vive numa camada própria, fora desta cobertura.
 *
 * Organismo puro: props in, sem adapters (o `online` chega resolvido pela wiring).
 */
export interface ConnectionGateProps {
  online: boolean;
  children: ReactNode;
}

export function ConnectionGate({ online, children }: ConnectionGateProps) {
  return (
    <div className="cds-connection-gate" data-offline={online ? undefined : true}>
      {!online && (
        <div className="cds-connection-gate-banner" role="status">
          <strong>Sem conexão</strong> — a edição está pausada e nada se perde. O áudio continua
          tocando; retomamos assim que a conexão voltar.
        </div>
      )}
      <div className="cds-connection-gate-content">
        {children}
        {!online && <div className="cds-connection-gate-overlay" aria-hidden="true" />}
      </div>
    </div>
  );
}
