import type { PaletteEntry } from '../../tokens';
import './pearl.css';

export type PearlState = 'unplayed' | 'lit' | 'head' | 'dim';

/**
 * A pérola do colar — vocabulário de estados do redesign §4.3; visual
 * normativo do protótipo "Ouvir no colar" (docs/design/). Decorativa:
 * o clique é da fileira (molécula), nunca da conta.
 */
export function Pearl({
  state = 'unplayed',
  tint,
  size = 26,
  sceneEnd = false,
  ping = false,
}: {
  state?: PearlState;
  /** cor do segmento {base, lit, deep} (§4.2); sem tint = pérola-aveia */
  tint?: PaletteEntry;
  /** diâmetro em px — as estações usam de 15 a 38 */
  size?: number;
  /** conta final da cena rende quadrada no fio (§4.3) */
  sceneEnd?: boolean;
  /** pulso curto de escala (referência .pearl.ping) */
  ping?: boolean;
}) {
  return (
    <span
      className="cds-pearl"
      aria-hidden="true"
      data-state={state}
      data-scene-end={sceneEnd || undefined}
      data-ping={ping || undefined}
      style={{
        '--cds-pearl-size': `${size}px`,
        '--cds-pearl-base': tint?.base,
        '--cds-pearl-lit': tint?.lit,
        '--cds-pearl-deep': tint?.deep,
      }}
    />
  );
}
