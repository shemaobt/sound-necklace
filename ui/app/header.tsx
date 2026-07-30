import { useTranslation } from 'react-i18next';
import * as Popover from '@radix-ui/react-popover';

import { SaveChip, type SaveStatus } from '../molecules';
import { ShemaIcon } from '../tokens';
import './header.css';

/**
 * Cabeçalho do app (Protótipo.dc.html, faixa de 64px): pill "← Histórias" + só o
 * ícone da marca à esquerda; entrada para Configurações e o toggle de som à
 * direita. Sem título — o nome do app vive no dashboard. A variante escura (telas
 * cerimoniais) é CSS puro: `.cds-app:has(...)` troca as custom properties de
 * chrome (app.css).
 *
 * O idioma NÃO se troca daqui (ENG-371, decisão do dono): um botão PT/EN de um
 * clique, ao lado do som, convidava a alternar no meio de uma sessão — e o idioma
 * governa a voz da entrevista e o locale mandado ao STT. Agora mora em
 * Configurações, junto das outras decisões do projeto, a um clique de distância.
 */
export function Header({
  muted,
  onToggleMuted,
  onBack,
  onSettings,
  volume = 1,
  onVolume,
  autosave,
}: {
  muted: boolean;
  onToggleMuted: () => void;
  onBack: () => void;
  /** Abre Configurações (idioma da interface + granularidade do projeto). */
  onSettings: () => void;
  /** Estado do autosave; presente numa sessão aberta, mostra o selo de salvamento. */
  autosave?: SaveStatus;
  /** Volume da história (0–2; 1 = neutro) — só faz sentido com sessão aberta. */
  volume?: number;
  /**
   * Presente, o ícone de som abre o popover com o reforço de volume (ENG-314);
   * ausente (fora de sessão), o botão segue o toggle simples de sempre.
   */
  onVolume?: (value: number) => void;
}) {
  const { t } = useTranslation();

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
        {autosave ? (
          <SaveChip
            status={autosave}
            savingLabel={t('autosave.saving')}
            savedLabel={t('autosave.saved')}
          />
        ) : null}
        <button
          type="button"
          className="cds-header-settings"
          aria-label={t('header.settings')}
          onClick={onSettings}
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
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
