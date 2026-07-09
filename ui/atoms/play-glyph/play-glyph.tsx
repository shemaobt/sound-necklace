/**
 * Glifo ▶/⏸ como SVG inline (protótipos; nunca unicode), herdando a cor do
 * contexto. Decorativo: o botão que o contém carrega o nome acessível.
 */
export function PlayGlyph({ state, size = 18 }: { state: 'play' | 'pause'; size?: number }) {
  return (
    <svg
      className="cds-play-glyph"
      data-state={state}
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      {state === 'play' ? (
        <path d="M8 5v14l11-7z" />
      ) : (
        <>
          <rect x="6" y="5" width="4" height="14" rx="1.4" />
          <rect x="14" y="5" width="4" height="14" rx="1.4" />
        </>
      )}
    </svg>
  );
}
