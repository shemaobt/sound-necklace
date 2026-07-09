import type { ReactNode } from 'react';

import { Pearl, PlayGlyph } from '../../atoms';
import type { PaletteEntry } from '../../tokens';
import './scene-phrase-chip.css';

/**
 * Pílula de um item salvo — cena (redesign §6.3) ou frase (§6.5): swatch ·
 * rótulo · ▶ · ações. É um GRUPO nomeado (não um botão) com botões-irmãos, para
 * nunca aninhar interativos (WCAG 4.1.2). As ações (Reabrir / ⚑ revisar /
 * ✕ remover) chegam como slot: quem chama monta os botões e cuida dos callbacks.
 */
export function ScenePhraseChip({
  label,
  swatch,
  playing = false,
  onPlay,
  actions,
  groupLabel,
}: {
  label: string;
  /** cor do segmento — presente, mostra o swatch-pérola */
  swatch?: PaletteEntry;
  /** item em reprodução: o ▶ vira ⏸ e o grupo sinaliza data-playing */
  playing?: boolean;
  onPlay?: () => void;
  /** botões de ação como slot (Reabrir / ⚑ revisar / ✕ remover) */
  actions?: ReactNode;
  /** nome acessível do grupo; padrão = o rótulo */
  groupLabel?: string;
}) {
  return (
    <div
      className="cds-scene-phrase-chip"
      role="group"
      aria-label={groupLabel ?? label}
      data-playing={playing || undefined}
    >
      {swatch ? <Pearl tint={swatch} size={18} state="lit" /> : null}
      <span className="cds-scene-phrase-chip-label">{label}</span>
      <button
        type="button"
        className="cds-scene-phrase-chip-play"
        aria-label={playing ? 'Pausar' : 'Tocar'}
        aria-pressed={playing}
        onClick={onPlay}
      >
        <PlayGlyph state={playing ? 'pause' : 'play'} size={16} />
      </button>
      {actions ? <span className="cds-scene-phrase-chip-actions">{actions}</span> : null}
    </div>
  );
}
