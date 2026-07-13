import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

import type { StationComponent } from './registries';
import './station-host.css';

/**
 * Resolve a estação ativa na station-registry e a renderiza; uma estação ainda
 * não construída cai num fallback quieto (docs/architecture.md §4). Assim, uma
 * issue de estação entra só ADICIONANDO seu `ui/pages/<estação>/` — o shell nunca
 * muda.
 *
 * A maioria das estações resolve tudo por dentro (sessão via `useSessionStore`) e
 * roda sem props; as que precisam de portas de wiring (a Export recebe o
 * `SessionStore` + o `sessionId`, ENG-270) recebem `stationProps`, repassados
 * ao componente resolvido. Props desconhecidas são ignoradas por estações sem elas.
 */
export function StationHost({
  stationKey,
  registry,
  stationProps,
}: {
  stationKey: string;
  registry: Record<string, StationComponent>;
  stationProps?: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const Station = registry[stationKey] as ComponentType<Record<string, unknown>> | undefined;
  if (!Station) {
    return <p className="cds-station-fallback">{t('shell.stationUnderConstruction')}</p>;
  }
  return <Station {...stationProps} />;
}
