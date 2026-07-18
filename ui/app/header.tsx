import { useTranslation } from 'react-i18next';
import * as Popover from '@radix-ui/react-popover';

import { ShemaIcon } from '../tokens';
import { setLang, type Lang } from '../i18n';
import './header.css';

/**
 * Cabeçalho do app (Protótipo.dc.html, faixa de 64px): pill "← Histórias" + só o
 * ícone da marca à esquerda; toggle de idioma PT/EN (ENG-279, não existe no
 * protótipo mas fica, discreto) e o toggle de som à direita. Sem título — o nome
 * do app vive no dashboard. A variante escura (telas cerimoniais) é CSS puro:
 * `.cds-app:has(...)` troca as custom properties de chrome (app.css).
 */
export function Header({
  muted,
  onToggleMuted,
  onBack,
  volume = 1,
  onVolume,
}: {
  muted: boolean;
  onToggleMuted: () => void;
  onBack: () => void;
  /** Volume da história (0–2; 1 = neutro) — só faz sentido com sessão aberta. */
  volume?: number;
  /**
   * Presente, o ícone de som abre o popover com o reforço de volume (ENG-314);
   * ausente (fora de sessão), o botão segue o toggle simples de sempre.
   */
  onVolume?: (value: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const other: Lang = i18n.language.startsWith('en') ? 'pt' : 'en';

  return (
    <header className="cds-header">
      <div className="cds-header-left">
        <button
          type="button"
          className="cds-header-back"
          aria-label={t('header.backAria')}
          onClick={onBack}
        >
          <svg
            width={17}
            height={17}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M19 12H5" />
            <path d="M11 6l-6 6 6 6" />
          </svg>
          {t('header.back')}
        </button>
        <span className="cds-header-icon">
          <ShemaIcon colorway="telha" size={26} />
        </span>
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
        {onVolume ? (
          <Popover.Root>
            <Popover.Trigger asChild>
              <button type="button" className="cds-header-sound" aria-label={t('header.soundMenu')}>
                <SoundGlyph muted={muted} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className="cds-header-sound-pop" sideOffset={8} align="end">
                <button
                  type="button"
                  className="cds-header-sound-mute"
                  aria-pressed={muted}
                  aria-label={muted ? t('header.unmute') : t('header.mute')}
                  onClick={onToggleMuted}
                >
                  <SoundGlyph muted={muted} />
                  {muted ? t('header.unmute') : t('header.mute')}
                </button>
                <label className="cds-header-volume">
                  <span className="cds-header-volume-label">{t('header.storyVolume')}</span>
                  {/* range nativo: 1 = neutro, o rabo acima de 1 é o reforço (§ ENG-314) */}
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={volume}
                    onChange={(e) => onVolume(Number(e.target.value))}
                  />
                </label>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        ) : (
          <button
            type="button"
            className="cds-header-sound"
            aria-pressed={muted}
            aria-label={muted ? t('header.unmute') : t('header.mute')}
            onClick={onToggleMuted}
          >
            <SoundGlyph muted={muted} />
          </button>
        )}
      </div>
    </header>
  );
}

/** Glifo de som/mudo (Feather stroke, viewBox 24) — decorativo, sem palavras. */
function SoundGlyph({ muted }: { muted: boolean }) {
  return (
    <svg
      width={18}
      height={18}
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
