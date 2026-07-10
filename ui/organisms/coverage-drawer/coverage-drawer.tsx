import * as Dialog from '@radix-ui/react-dialog';

import { skShort, type Coverage, type KindCoverage } from '../../../domain';
import './coverage-drawer.css';

/**
 * "Cobertura · só facilitadora" (PRD v2 §8.5; protótipo "Colar de Sons -
 * Protótipo", drawer da Triagem): painel olive que desliza da direita, fechado
 * por padrão e invisível ao ouvinte até a facilitadora abrir pela aba lateral.
 * Contagens por tipo em mono (superfície densa de facilitadora — dígitos são
 * permitidos aqui) e "candidatos a ausência" = raras sem cobertura firme.
 * Presentacional: recebe um `Coverage` pronto do domínio.
 *
 * Sobre Radix Dialog: `Title` é obrigatório; sem `Description`, o `Content`
 * leva `aria-describedby={undefined}` para não apontar para id inexistente.
 */

/** O domain dá o alvo numérico; a exibição do range das raras é do drawer. */
function targetLabel(k: KindCoverage): string {
  return k.tier === 'ALTA' ? '1–2' : String(k.target);
}

export interface CoverageDrawerProps {
  coverage: Coverage;
}

export function CoverageDrawer({ coverage }: CoverageDrawerProps) {
  const rows = coverage.kinds.filter((k) => k.firm + k.hesitant > 0);
  const absent = coverage.kinds.filter((k) => k.candidateAbsence);
  return (
    <Dialog.Root>
      <Dialog.Trigger className="cds-coverage-drawer-tab" aria-label="Cobertura (facilitadora)">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M3 20h18" />
          <path d="M6 20V9" />
          <path d="M12 20V4" />
          <path d="M18 20v-8" />
        </svg>
        <span className="cds-coverage-drawer-tab-label">cobertura</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="cds-coverage-drawer-overlay" />
        <Dialog.Content className="cds-coverage-drawer-panel" aria-describedby={undefined}>
          <div className="cds-coverage-drawer-head">
            <Dialog.Title className="cds-coverage-drawer-title">
              Cobertura · só facilitadora
            </Dialog.Title>
            <Dialog.Close className="cds-coverage-drawer-close" aria-label="fechar">
              ×
            </Dialog.Close>
          </div>
          <p className="cds-coverage-drawer-intro">
            Cenas produtivas: <strong>{coverage.productive}</strong>. Contagem por tipo (dado da
            facilitadora, escondido do ouvinte).
          </p>
          <div className="cds-coverage-drawer-rows">
            {rows.map((k) => (
              <div key={k.value} className="cds-coverage-drawer-row" data-status={k.status}>
                <span className="cds-coverage-drawer-kind">{k.value}</span>
                <span className="cds-coverage-drawer-counts">
                  firme {k.firm} · hesitante {k.hesitant} · alvo {targetLabel(k)}
                </span>
              </div>
            ))}
          </div>
          <div className="cds-coverage-drawer-absence">Candidatos a ausência (raras em aberto)</div>
          <div className="cds-coverage-drawer-chips">
            {absent.map((k) => (
              <span key={k.value} className="cds-coverage-drawer-chip">
                {skShort(k.value)}
              </span>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
