import { ShemaIcon } from '../tokens';
import './header.css';

/**
 * Cabeçalho do app (referência L203–212 + PRD §9/§13): a marca Shemá e o toggle de
 * som que silencia todo som da UI. O toggle é presentacional aqui — o shell liga o
 * app store (`muted`); o áudio das estações consulta esse estado.
 */
export function Header({ muted, onToggleMuted }: { muted: boolean; onToggleMuted: () => void }) {
  return (
    <header className="cds-header">
      <div className="cds-header-brand">
        <ShemaIcon colorway="telha" size={44} />
        <div>
          <p className="cds-header-eyebrow">Arquivo Oral · Tripod</p>
          <h1 className="cds-header-title">Colar de Sons</h1>
          <p className="cds-header-subtitle">Mapeando as histórias do arquivo oral.</p>
        </div>
      </div>
      <button
        type="button"
        className="cds-header-sound"
        aria-pressed={muted}
        aria-label={muted ? 'Ligar o som da interface' : 'Desligar o som da interface'}
        onClick={onToggleMuted}
      >
        <SoundGlyph muted={muted} />
      </button>
    </header>
  );
}

/** Glifo de som/mudo (Feather stroke, viewBox 24) — decorativo, sem palavras. */
function SoundGlyph({ muted }: { muted: boolean }) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      {muted ? (
        <path d="M17 9l4 6M21 9l-4 6" />
      ) : (
        <path d="M16 8.5a4 4 0 0 1 0 7M18.5 6a7 7 0 0 1 0 12" />
      )}
    </svg>
  );
}
