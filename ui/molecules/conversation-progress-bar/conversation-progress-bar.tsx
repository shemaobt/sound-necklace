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
 * as cores são fixas para fundo escuro.
 *
 * O quanto já se andou é a PORCENTAGEM, desenhada: cada segmento tem a sua parte
 * cumprida acesa e o resto apagado, e o marcador é a cabeça desse preenchimento —
 * uma posição só, não duas. Antes o trecho inteiro acendia de uma vez ao ser
 * alcançado, então dentro de uma cena de cinco perguntas a barra ficava idêntica
 * da primeira à última: quem estava respondendo não via a cena andar.
 *
 * Sem dígitos (§9.2 — esta é tela de ouvinte): a legenda é o rótulo do trecho
 * atual, nunca "Trecho X de N", e a fração se lê no comprimento aceso. Para quem
 * ouve a tela o `aria-valuetext` põe o mesmo rótulo no lugar da leitura do número.
 * Presentacional: trechos + posição por prop.
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
  const pos = Math.min(Math.max(current, 0), total - 1);
  const found = bounds.findIndex((b) => pos < b.end);
  const currentIdx = found === -1 ? trechos.length - 1 : found;
  const currentTrecho = trechos[currentIdx]!;
  /**
   * Quantas perguntas já foram alcançadas — a em foco INCLUÍDA. Estar nela é ter
   * chegado nela; contar só as anteriores deixava a barra vazia na primeira
   * pergunta e nunca cheia na última, e a conversa termina na última pergunta.
   */
  const reached = pos + 1;
  const markerPct = (reached / total) * 100;

  return (
    <div className="cds-conv-progress">
      <div
        className="cds-conv-progress-bar"
        // a legenda fica FORA da barra: dentro de um progressbar o texto não é
        // lido, e o rótulo do trecho é justamente o que a pessoa precisa ouvir
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={reached}
        // o número existe para a semântica, não para o ouvido: o texto substitui a
        // leitura de "14 de 21" pelo trecho, que é o que a pessoa precisa saber (§9.2)
        aria-valuetext={currentTrecho.label}
      >
        <div className="cds-conv-progress-rail">
          {trechos.map((tr, i) => (
            <div
              key={i}
              className="cds-conv-progress-seg"
              style={{
                left: `${(bounds[i]!.start / total) * 100}%`,
                width: `${(tr.count / total) * 100}%`,
              }}
            >
              {/* o apagado e o aceso são elementos IRMÃOS, não pai e filho: a
                  opacidade de um pai multiplicaria a do filho e não haveria como
                  o preenchimento voltar à cor cheia */}
              <div className="cds-conv-progress-track" style={{ background: tr.color.base }} />
              <div
                className="cds-conv-progress-fill"
                style={{
                  width: `${Math.min(Math.max(reached - bounds[i]!.start, 0) / tr.count, 1) * 100}%`,
                  background: tr.color.base,
                }}
              />
            </div>
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
