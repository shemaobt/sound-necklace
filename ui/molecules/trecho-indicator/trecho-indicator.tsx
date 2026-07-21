import type { ReactNode } from 'react';

import type { PaletteEntry } from '../../tokens';
import './trecho-indicator.css';

/**
 * Indicador + reprodutor do trecho (design "novos componentes", card "Indicador +
 * reprodutor do trecho"): um ponto na cor do trecho + o NOME do trecho, ao lado do
 * ▶ que toca o áudio daquele trecho (a história, a cena ou a frase). O nome usa a
 * cor viva do trecho; o botão de tocar chega como children (a página o liga ao
 * player). Sem número (§9.2): o rótulo é o tipo do trecho — a frase herda o da
 * cena-mãe. Presentacional: cor + rótulo por prop.
 */
export function TrechoIndicator({
  color,
  label,
  children,
}: {
  color: PaletteEntry;
  label: string;
  /** o botão ▶ de tocar o trecho (ligado ao player pela página) */
  children?: ReactNode;
}) {
  return (
    <div className="cds-trecho-indicator">
      <span
        className="cds-trecho-indicator-dot"
        aria-hidden="true"
        style={{
          background: `radial-gradient(circle at 34% 30%, ${color.lit} 0%, ${color.base} 70%)`,
        }}
      />
      <span className="cds-trecho-indicator-label" style={{ color: color.lit }}>
        {label}
      </span>
      {children}
    </div>
  );
}
