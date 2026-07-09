import type { StationComponent } from './registries';
import './station-host.css';

/**
 * Resolve a estação ativa na station-registry e a renderiza; uma estação ainda
 * não construída cai num fallback quieto (docs/architecture.md §4). Assim, uma
 * issue de estação entra só ADICIONANDO seu `ui/pages/<estação>/` — o shell nunca
 * muda.
 */
export function StationHost({
  stationKey,
  registry,
}: {
  stationKey: string;
  registry: Record<string, StationComponent>;
}) {
  const Station = registry[stationKey];
  if (!Station) {
    return <p className="cds-station-fallback">estação em construção</p>;
  }
  return <Station />;
}
