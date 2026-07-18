import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';

import { type Coverage, type KindCoverage } from '../../../domain';
import { sceneKindLabel } from '../../i18n/scene-kind-label';
import './coverage-drawer.css';

/**
 * "Cobertura · só facilitadora" (PRD v2 §8.5; protótipo "Colar de Sons -
 * Protótipo", drawer da Triage): painel olive que desliza da direita, fechado
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
  const { t, i18n } = useTranslation();
  const rows = coverage.kinds.filter((k) => k.firm + k.hesitant > 0);
  const absent = coverage.kinds.filter((k) => k.candidateAbsence);
  return (
    <Dialog.Root>
      <Dialog.Trigger className="cds-coverage-drawer-tab" aria-label={t('coverageDrawer.tabAria')}>
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
        <span className="cds-coverage-drawer-tab-label">{t('coverageDrawer.tabLabel')}</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="cds-coverage-drawer-overlay" />
        <Dialog.Content className="cds-coverage-drawer-panel" aria-describedby={undefined}>
          <div className="cds-coverage-drawer-head">
            <Dialog.Title className="cds-coverage-drawer-title">
              {t('coverageDrawer.title')}
            </Dialog.Title>
            <Dialog.Close
              className="cds-coverage-drawer-close"
              aria-label={t('coverageDrawer.close')}
            >
              ×
            </Dialog.Close>
          </div>
          <p className="cds-coverage-drawer-intro">
            {t('coverageDrawer.introPre')}
            <strong>{coverage.productive}</strong>
            {t('coverageDrawer.introPost')}
          </p>
          <div className="cds-coverage-drawer-rows">
            {rows.map((k) => (
              <div key={k.value} className="cds-coverage-drawer-row" data-status={k.status}>
                <span className="cds-coverage-drawer-kind">{k.value}</span>
                <span className="cds-coverage-drawer-counts">
                  {t('coverageDrawer.counts', {
                    firm: k.firm,
                    hesitant: k.hesitant,
                    target: targetLabel(k),
                  })}
                </span>
              </div>
            ))}
          </div>
          <div className="cds-coverage-drawer-absence">{t('coverageDrawer.absence')}</div>
          <div className="cds-coverage-drawer-chips">
            {absent.map((k) => (
              <span key={k.value} className="cds-coverage-drawer-chip">
                {sceneKindLabel(k.value, i18n.language)}
              </span>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
