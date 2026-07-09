import './waveform-bar.css';

/**
 * Barra vertical da forma de onda (gravação ao vivo no Mapeamento).
 * As alturas vêm de props — quem anima é a molécula, atualizando-as.
 */
export function WaveformBar({ height, active = false }: { height: number; active?: boolean }) {
  return (
    <span
      className="cds-waveform-bar"
      aria-hidden="true"
      data-state={active ? 'active' : 'rest'}
      style={{ '--cds-bar-height': `${height}px` }}
    />
  );
}
