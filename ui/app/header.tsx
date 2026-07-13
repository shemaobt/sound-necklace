import { useTranslation } from 'react-i18next';

import { ShemaIcon } from '../tokens';
import { setLang, type Lang } from '../i18n';
import './header.css';

/**
 * Cabeçalho do app (referência L203–212 + PRD §9/§13): a marca Shemá, o toggle de
 * idioma PT/EN (ENG-279) e o toggle de som que silencia todo som da UI. O som é
 * presentacional aqui — o shell liga o app store (`muted`); o idioma é resolvido pelo
 * i18n (camada de wiring) e persiste no reload.
 */
export function Header({ muted, onToggleMuted }: { muted: boolean; onToggleMuted: () => void }) {
  const { t, i18n } = useTranslation();
  const other: Lang = i18n.language.startsWith('en') ? 'pt' : 'en';

  return (
    <header className="cds-header">
      <div className="cds-header-brand">
        <ShemaIcon colorway="telha" size={44} />
        <div>
          <p className="cds-header-eyebrow">{t('header.eyebrow')}</p>
          <h1 className="cds-header-title">{t('header.title')}</h1>
          <p className="cds-header-subtitle">{t('header.subtitle')}</p>
        </div>
      </div>
      <div className="cds-header-actions">
        <button
          type="button"
          className="cds-header-lang"
          aria-label={t('header.switchLanguage')}
          onClick={() => setLang(other)}
        >
          {other.toUpperCase()}
        </button>
        <button
          type="button"
          className="cds-header-sound"
          aria-pressed={muted}
          aria-label={muted ? t('header.unmute') : t('header.mute')}
          onClick={onToggleMuted}
        >
          <SoundGlyph muted={muted} />
        </button>
      </div>
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
