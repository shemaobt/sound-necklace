import type { PaletteEntry } from '../../tokens';
import './conversation-progress-bar.css';

export interface ConversationTrecho {
  /** número de perguntas do trecho — a largura do segmento é proporcional a ele */
  count: number;
  /** cor do segmento (paleta de cena/frase, ou a cor da história) */
  color: PaletteEntry;
  /** rótulo do trecho, SEM número: o tipo da cena; a frase herda o da cena-mãe */
  label: string;
}

/**
 * Barra de progresso da conversa (design "novos componentes", card "Progresso da
 * conversa"): uma barra contínua dividida por TRECHO — a história, cada cena, cada
 * frase — cada um na sua cor, divisórias sutis nas fronteiras, e um marcador na
 * posição atual. Substitui as contas por-pergunta no rodapé do palco (ENG-350):
 * o marcador desliza sem congelar e a cor + a divisória mostram quando a conversa
 * entra numa cena/frase nova. Sempre sobre o oliva cerimonial da conversa, então
 * as cores são fixas para fundo escuro. Sem dígitos (§9.2): a legenda é o rótulo
 * do trecho atual, não "Trecho X de N". Presentacional: trechos + posição por prop.
 */
export function ConversationProgressBar({
  trechos,
  current,
  total,
  ariaLabel,
}: {
  trechos: readonly ConversationTrecho[];
  /** índice da pergunta atual (0-based) na sequência inteira */
  current: number;
  /** total de perguntas (= soma das contagens dos trechos) */
  total: number;
  ariaLabel: string;
}) {
  if (trechos.length === 0 || total <= 0) return null;

  // fronteiras acumuladas e qual trecho contém a pergunta atual (sem acumulador
  // mutável no render — trechos são poucos, o custo O(n²) é irrelevante)
  const bounds = trechos.map((tr, i) => {
    const start = trechos.slice(0, i).reduce((sum, x) => sum + x.count, 0);
    return { start, end: start + tr.count };
  });
  const found = bounds.findIndex((b) => current < b.end);
  const currentIdx = found === -1 ? trechos.length - 1 : found;
  const currentTrecho = trechos[currentIdx]!;
  const markerPct =
    total > 1 ? (Math.min(Math.max(current, 0), total - 1) / (total - 1)) * 100 : 100;

  return (
    <div className="cds-conv-progress" role="group" aria-label={ariaLabel}>
      <div className="cds-conv-progress-bar">
        <div className="cds-conv-progress-rail">
          {trechos.map((tr, i) => (
            <div
              key={i}
              className="cds-conv-progress-seg"
              data-past={i <= currentIdx || undefined}
              style={{
                left: `${(bounds[i]!.start / total) * 100}%`,
                width: `${(tr.count / total) * 100}%`,
                background: tr.color.base,
              }}
            />
          ))}
          {bounds.slice(1).map((b, i) => (
            <div
              key={`tick-${i}`}
              className="cds-conv-progress-tick"
              style={{ left: `${(b.start / total) * 100}%` }}
            />
          ))}
        </div>
        <div
          className="cds-conv-progress-marker"
          style={{
            left: `${markerPct}%`,
            boxShadow: `0 0 0 3px ${currentTrecho.color.base}, 0 2px 6px rgba(10, 7, 3, 0.4)`,
          }}
        />
      </div>
      <div className="cds-conv-progress-caption">{currentTrecho.label}</div>
    </div>
  );
}
