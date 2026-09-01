import './story-progress-bar.css';

/**
 * A barra da história inteira (protótipo v4, "BARRA ÚNICA — a história inteira,
 * com marcas de etapa"): um trilho fino com o preenchimento do quanto já andou,
 * as divisórias das etapas nas fronteiras e um marcador na cabeça do
 * preenchimento. É a história toda numa linha — não o progresso da estação atual.
 *
 * Presentacional: recebe a porcentagem já calculada e as fronteiras já em
 * porcentagem; não sabe o que é uma cena, uma frase ou uma pergunta. Sem dígito
 * nenhum (§9.2) — o quanto se andou lê-se no comprimento aceso, nunca num "3 de
 * 6". Segue `aria-hidden` depois de o fio de contas sair (ENG-668): quem diz a etapa
 * a leitores de tela é o nome da etapa na faixa em volta (ui/app/story-progress.tsx),
 * e dar um papel de barra de progresso a este trilho poria no ouvido justamente a
 * porcentagem que §9.2 mantém fora dos olhos.
 *
 * Toda porcentagem chega de uma divisão, e várias delas têm denominador que pode
 * ser zero numa sessão real (nenhuma cena, nenhuma cena produtiva). Um `NaN` num
 * `width` de CSS não é erro: é uma barra que simplesmente não aparece. Por isso o
 * clamp mora aqui também, na última porta antes do estilo.
 *
 * A marca da meta de hoje (ENG-653) é o terceiro elemento do trilho, ao lado do
 * preenchimento e das divisórias: um traço fixo onde os dois combinaram chegar. Sem
 * meta ela NÃO é renderizada — não é um elemento escondido —, porque um traço
 * invisível ainda é um traço para quem lê o DOM.
 */
export function StoryProgressBar({
  percent,
  dividers,
  goal = null,
}: {
  /** 0–100: o quanto da história inteira já foi feito. */
  percent: number;
  /** Fronteiras entre as etapas, em porcentagem (0 e 100 excluídos). */
  dividers: readonly number[];
  /** 0–100 da meta de hoje, ou `null`/omitida quando não há meta. */
  goal?: number | null;
}) {
  const pct = clampPercent(percent);
  return (
    <div className="cds-story-progress-wrap" aria-hidden="true">
      <div className="cds-story-progress-track">
        <div className="cds-story-progress-fill" style={{ width: `${pct}%` }} />
        {dividers.map((at) => (
          <div
            key={at}
            className="cds-story-progress-tick"
            style={{ left: `${clampPercent(at)}%` }}
          />
        ))}
        {goal === null ? null : (
          <div
            className="cds-story-progress-goal"
            style={{ left: `calc(${clampPercent(goal)}% - 1.5px)` }}
          />
        )}
        <div className="cds-story-progress-marker" style={{ left: `calc(${pct}% - 7px)` }} />
      </div>
    </div>
  );
}

/** 0–100, e nunca `NaN`/`Infinity` — ver o comentário do componente. */
function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
