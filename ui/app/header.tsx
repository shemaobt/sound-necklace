import { useTranslation } from 'react-i18next';
import * as Popover from '@radix-ui/react-popover';

import { SaveChip, type SaveStatus } from '../molecules';
import { ColarIcon } from '../tokens';
import type { Theme } from './theme';
import './header.css';

/**
 * Cabeçalho do app (Protótipo.dc.html, faixa de 64px): pill "← Histórias" + só o
 * ícone da marca à esquerda; o toggle de som à direita. Sem título — o nome do app vive no dashboard. A variante escura (telas
 * cerimoniais) é CSS puro: `.cds-app:has(...)` troca as custom properties de
 * chrome (app.css).
 *
 * O idioma NÃO se troca daqui (ENG-371/ENG-375, decisão do dono): um botão PT/EN de
 * um clique, ao lado do som, convidava a alternar no meio de uma sessão — e o idioma
 * governa a voz da entrevista e o locale mandado ao STT. Mora em Configurações, e o
 * caminho até lá é a CASA: enquanto houver sessão aberta, este cabeçalho não oferece
 * atalho nenhum para lá, senão o atrito que se quis criar não existiria.
 */
export function Header({
  muted,
  onToggleMuted,
  onBack,
  volume = 1,
  onVolume,
  autosave,
  theme = 'light',
  onToggleTheme,
  backDisabled = false,
  onBackBlocked,
}: {
  muted: boolean;
  onToggleMuted: () => void;
  onBack: () => void;
  /**
   * Gravando, sair da estação perde a resposta em curso (ENG-393). Este é o
   * único caminho de saída fora do palco da conversa, então a trava precisa
   * chegar até aqui.
   */
  backDisabled?: boolean;
  /**
   * O clique recusado, para quem sabe fazer barulho: a recusa devolve som, não
   * texto. Por isso o botão continua clicável e o handler é que decide — uma
   * subárvore inerte não despacharia clique nenhum, e a recusa ficaria muda.
   */
  onBackBlocked?: () => void;
  /** Estado do autosave; presente numa sessão aberta, mostra o selo de salvamento. */
  autosave?: SaveStatus;
  /** Tema em vigor — decide o glifo (lua no claro, sol no escuro) e o rótulo. */
  theme?: Theme;
  /** Ausente, o botão de tema não aparece: nenhum controle que não faz nada. */
  onToggleTheme?: () => void;
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
          aria-disabled={backDisabled || undefined}
          onClick={backDisabled ? onBackBlocked : onBack}
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
          <ColarIcon size={26} />
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
        {onToggleTheme ? (
          <button
            type="button"
            className="cds-header-theme"
            aria-label={theme === 'dark' ? t('header.themeToLight') : t('header.themeToDark')}
            onClick={onToggleTheme}
          >
            <ThemeGlyph theme={theme} />
          </button>
        ) : null}
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

/**
 * Glifo de tema (Feather stroke, viewBox 24) — decorativo, sem palavras: mostra o
 * DESTINO do clique, lua no claro e sol no escuro, como no pacote de design.
 */
function ThemeGlyph({ theme }: { theme: Theme }) {
  return theme === 'dark' ? (
    <svg
      className="cds-ico-sun"
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
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
    </svg>
  ) : (
    <svg
      className="cds-ico-moon"
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
      <path d="M20.5 14.3A8.5 8.5 0 1 1 9.7 3.5a6.8 6.8 0 0 0 10.8 10.8z" />
    </svg>
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
