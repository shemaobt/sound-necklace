import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Player } from '../../../adapters/audio';
import type { UiSound } from '../../../adapters/ui-sound';
import {
  computeCoverage,
  lockedParts,
  type Frase,
  type ScenePart,
  type Span,
} from '../../../domain';
import { sceneKindLabel } from '../../i18n/scene-kind-label';
import { ScenePearl, type ScenePearlFill } from '../../molecules';
import {
  type ClosedBlock,
  Necklace,
  type NecklaceSegment,
  SIZE_EXPORT,
  StationNav,
} from '../../organisms';
import {
  CoverageDrawer,
  type CoverageStoryOverview,
} from '../../organisms/coverage-drawer/coverage-drawer';
import { useSessionStore } from '../../state';
import { sceneColor } from '../../tokens';
import './review.css';

/**
 * Rever — a quinta e última estação (ENG-725; desenho docs/design/revisao-tela-nova.html). Entra
 * entre fechar a última frase e a tela de conclusão: a dupla vê, pela primeira
 * vez, o próprio trabalho junto — o colar inteiro, com a cor de cada cena e as
 * marcas de fim de frase e de fim de cena; a fila de pérolas de cena, com a
 * confiança embutida na própria pérola; e a linha de contexto quando alguma cena
 * ficou fora dos tipos ou sem frase, que são respostas, não erros.
 *
 * Decisões do dono (2026-09-01): os dois a veem (§9.2 inteira: nenhum dígito,
 * contador, id ou tabela); NADA se edita aqui — a estação mostra e toca, e nunca
 * escreve no `sessionStore`; e concluir é um ato consciente: com cena na dúvida ou
 * sem tipo, o primeiro toque avisa que dá para seguir assim mesmo e pede o segundo.
 *
 * Camada de wiring: lê a sessão do `sessionStore`; o áudio chega por prop
 * (`Player`), como na Escuta e nas Frases — o colar só avisa em que conta se tocou.
 * Concluir avisa o shell (`onBlockClosed('historia')`); é o shell (App.tsx) quem
 * chama `store.complete()` e só sobe a tela oliva se o servidor confirmar (ENG-702)
 * — uma recusa vira `completeError` aqui, e o mesmo botão tenta de novo (§9.4).
 *
 * ENG-726 — a gaveta de cobertura (`CoverageDrawer`, organismo compartilhado com
 * a Triagem) monta aqui também: é a ÚNICA exceção deliberada à regra de "nenhum
 * dígito" — nasce fechada, é só da facilitadora, e o próprio cabeçalho dela
 * estampa isso (desenho `docs/design/revisao-tela-nova.html`, bloco `drawerOpen`).
 * O resumo (cenas/frases/duração/confiança) e a lista cena a cena que ela ganha
 * aqui se montam a partir de `scenes` — o mesmo array que já monta as pérolas —,
 * NUNCA de `domain/`, que é camada congelada e esta fatia não toca. Tocar numa
 * linha da lista reaproveita `onPearl`: seleciona e toca a mesma cena no
 * panorama atrás da gaveta.
 */

/** O aviso some sozinho depois de um tempo (protótipo `_wt`, 9 s). */
const WARN_MS = 9000;

/** Conversão de unidade, não dado de domínio: contas × segundos/conta → "m:ss". */
function mmss(beadCount: number, beadSec: number): string {
  const totalSeconds = Math.round(beadCount * beadSec);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface ReviewScene {
  part: ScenePart;
  span: Span;
  /** posição no colar, 0-based: a base da cor */
  index: number;
  /** as frases travadas desta cena, com span */
  phrases: (Frase & { span: Span })[];
}

export interface ReviewProps {
  player?: Player | null;
  /** A voz da UI (§9): o aviso recusa de leve, concluir avança. */
  sound?: UiSound;
  /** Concluir fecha a história — quem desenha a tela é o shell. */
  onBlockClosed?: (block: ClosedBlock) => void;
  /**
   * Concluir falhou no servidor (ENG-702, §9.4: nunca punir) — o shell tentou
   * `store.complete()` e recusou a tela de parabéns porque ela mentiria. Mostra o
   * aviso e deixa o mesmo botão tentar de novo; o shell decide quando limpar.
   */
  completeError?: string | null;
}

function fillOf(part: ScenePart): ScenePearlFill {
  return part.tag_state === 'tagged' && part.scene_kind_confidence
    ? part.scene_kind_confidence
    : 'none';
}

export function Review({ player = null, sound, onBlockClosed, completeError = null }: ReviewProps) {
  const { t, i18n } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const [head, setHead] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [warn, setWarn] = useState(false);

  // Tudo o que a tela deriva da sessão num único memo por `session` (ref estável
  // entre frames de playback → o campo do colar não recomputa quando só a cabeça
  // anda). As cenas travadas, na ordem do colar; cada uma com as suas frases.
  const derived = useMemo(() => {
    if (!session) return null;
    const scenes: ReviewScene[] = lockedParts(session)
      .filter((p): p is ScenePart & { span: Span } => p.span !== null)
      .sort((a, b) => a.span.s - b.span.s)
      .map((part, index) => ({
        part,
        span: part.span,
        index,
        phrases: session.frases.filter(
          (f): f is Frase & { span: Span } =>
            f.locked && f.span !== null && f.part_link === part.part_id,
        ),
      }));
    // cena fora dos tipos fica creme tracejada até o fim, como no desenho: a cor
    // é do tipo, não do corte
    const segments: NecklaceSegment[] = scenes.map((sc) =>
      sc.part.tag_state === 'tagged'
        ? { span: sc.span, tint: sceneColor(sc.index) }
        : { span: sc.span, noneFit: true },
    );
    const lockedEndBeads = scenes.map((sc) => sc.span.e);
    const phraseEndBeads = scenes.flatMap((sc) => sc.phrases.map((f) => f.span.e));

    // ENG-726 — a parte CARA da gaveta de cobertura (rótulos traduzidos,
    // duração formatada): memoizada aqui, com `head` de fora das deps de
    // propósito, para não refazer a cada tique do playhead durante a
    // reprodução — a mesma garantia que o parágrafo acima já dá ao colar.
    // `selected`/`onSelect` (baratos, mudam só com clique) entram depois,
    // fora deste memo.
    const coverage = computeCoverage(session);
    const namedScenes = scenes.filter((sc) => sc.part.tag_state === 'tagged');
    const confidenceTally = { high: 0, medium: 0, low: 0 };
    for (const sc of namedScenes) {
      const c = sc.part.scene_kind_confidence;
      if (c) confidenceTally[c]++;
    }
    const overviewBase = {
      totalScenes: scenes.length,
      namedScenes: namedScenes.length,
      noneFitScenes: scenes.length - namedScenes.length,
      totalPhrases: scenes.reduce((total, sc) => total + sc.phrases.length, 0),
      scenesWithoutPhrases: namedScenes.filter((sc) => sc.phrases.length === 0).length,
      duration: mmss(session.totalBeads, session.beadSec),
      beadSec: session.beadSec,
      confidenceHigh: confidenceTally.high,
      confidenceMedium: confidenceTally.medium,
      confidenceLow: confidenceTally.low,
      sceneRows: scenes.map((sc) => ({
        key: sc.part.part_id,
        label:
          sc.part.tag_state === 'tagged' && sc.part.scene_kind
            ? sceneKindLabel(sc.part.scene_kind, i18n.language)
            : t('coverageDrawer.sceneNoneFit'),
        fill: fillOf(sc.part),
        tint: sc.part.tag_state === 'tagged' ? sceneColor(sc.index) : undefined,
        duration: mmss(sc.span.e - sc.span.s + 1, session.beadSec),
        phraseCount: sc.phrases.length,
      })),
    };
    return { scenes, segments, lockedEndBeads, phraseEndBeads, coverage, overviewBase };
  }, [session, i18n, t]);

  useEffect(() => {
    if (!player) return;
    return player.onHead(setHead);
  }, [player]);
  useEffect(() => {
    if (!player) return;
    return () => player.stop();
  }, [player]);
  useEffect(() => {
    if (!warn) return;
    const timer = setTimeout(() => setWarn(false), WARN_MS);
    return () => clearTimeout(timer);
  }, [warn]);

  if (!session || !derived) return null;
  const { scenes, segments, lockedEndBeads, phraseEndBeads, coverage, overviewBase } = derived;

  /**
   * Tocar de novo no mesmo alvo PARA (protótipo `playSpan`); alvo novo toca do
   * começo. A chave nomeia o alvo — a frase, a cena, ou a conta de onde se partiu.
   */
  const playSpan = (key: string, span: Span): void => {
    if (!player) return;
    if (player.state.key === key && player.state.playing) player.stop();
    else player.toggle(key, span.s, span.e);
  };

  // conta dentro de uma frase → a frase inteira; fora de qualquer frase → dali
  // até o fim da cena; fora de qualquer cena → nada (protótipo `clickBead`)
  const onBead = (bead: number): void => {
    setWarn(false);
    const sc = scenes.find((s) => bead >= s.span.s && bead <= s.span.e);
    if (!sc) return;
    setSelected(sc.part.part_id);
    const ph = sc.phrases.find((f) => bead >= f.span.s && bead <= f.span.e);
    if (ph) playSpan(`frase:${ph.prop_id}`, ph.span);
    else playSpan(`conta:${bead}`, { s: bead, e: sc.span.e });
  };

  const onPearl = (sc: ReviewScene): void => {
    setWarn(false);
    setSelected(sc.part.part_id);
    playSpan(`cena:${sc.part.part_id}`, sc.span);
  };

  // a conta que brilha é o alvo que está tocando: tocá-la para
  const onHeadTap = (): void => {
    player?.stop();
  };

  // ENG-726 — a parte BARATA da gaveta: só a seleção e o clique, refeitos a
  // cada render (mudam com o clique, nunca com o playhead). Os rótulos e a
  // duração já vieram prontos de `overviewBase`, memoizado acima por sessão —
  // um tique do playhead não refaz a lista inteira nem chama `sceneKindLabel`.
  const { sceneRows, ...overviewCounts } = overviewBase;
  const storyOverview: CoverageStoryOverview = {
    ...overviewCounts,
    scenes: sceneRows.map((row, i) => ({
      ...row,
      selected: selected === row.key,
      onSelect: () => onPearl(scenes[i]!),
    })),
  };

  const doubtful = scenes.some(
    (sc) => sc.part.tag_state !== 'tagged' || sc.part.scene_kind_confidence === 'low',
  );
  const conclude = (): void => {
    if (doubtful && !warn) {
      setWarn(true);
      sound?.refuse();
      return;
    }
    setWarn(false);
    player?.stop();
    sound?.advance();
    onBlockClosed?.('historia');
  };

  // A linha de contexto concorda em número com as cenas que descreve; a contagem
  // só escolhe a forma da frase e nunca aparece na tela (§9.2).
  const noneCount = scenes.filter((sc) => sc.part.tag_state === 'none_fit').length;
  const noPhraseCount = scenes.filter(
    (sc) => sc.part.tag_state === 'tagged' && sc.phrases.length === 0,
  ).length;
  const hint =
    noneCount > 0 && noPhraseCount > 0
      ? t('rever.hintBoth', {
          none: t('rever.hintBothNone', { count: noneCount }),
          phrase: t('rever.hintBothPhrase', { count: noPhraseCount }),
          tail: t(noneCount + noPhraseCount === 2 ? 'rever.hintBothTwo' : 'rever.hintBothAll'),
        })
      : noneCount > 0
        ? t('rever.hintNone', { count: noneCount })
        : noPhraseCount > 0
          ? t('rever.hintNoPhrase', { count: noPhraseCount })
          : null;

  return (
    <section className="cds-review">
      <div className="cds-review-header">
        <h2 className="cds-review-title">{t('rever.title')}</h2>
        <p className="cds-review-instruction" data-role="instruction">
          {t('rever.instruction')}
        </p>
      </div>

      <div className="cds-review-stage">
        <Necklace
          totalBeads={session.totalBeads}
          beadSec={session.beadSec}
          segments={segments}
          lockedEndBeads={lockedEndBeads}
          phraseEndBeads={phraseEndBeads}
          size={SIZE_EXPORT}
          transportOnly
          playbackHead={head}
          onBeadPointerDown={onBead}
          onHeadTap={onHeadTap}
        />
      </div>

      <div className="cds-review-scenes">
        {scenes.map((sc) => (
          <ScenePearl
            key={sc.part.part_id}
            label={
              sc.part.tag_state === 'tagged' && sc.part.scene_kind
                ? sceneKindLabel(sc.part.scene_kind, i18n.language)
                : t('rever.noneFit')
            }
            fill={fillOf(sc.part)}
            tint={sc.part.tag_state === 'tagged' ? sceneColor(sc.index) : undefined}
            selected={selected === sc.part.part_id}
            onClick={() => onPearl(sc)}
          />
        ))}
      </div>

      {hint ? <p className="cds-review-hint">{hint}</p> : null}

      {warn ? (
        <div className="cds-review-warn-wrap">
          <p className="cds-review-warn" role="status">
            {t('rever.warn')}
          </p>
        </div>
      ) : null}

      {completeError ? (
        <div className="cds-review-warn-wrap">
          <p className="cds-review-warn" role="alert">
            {completeError}
          </p>
        </div>
      ) : null}

      {/* a legenda das marcas mora no rodapé (desenho), à esquerda do Concluir: é o
          que cada preenchimento e cada forma quer dizer — conteúdo funcional, não
          o rótulo de contexto do centro, que fica vazio por decisão do dono */}
      <StationNav
        aside={
          <ul className="cds-review-legend">
            <li>
              <span className="cds-review-swatch" data-mark="high" aria-hidden="true" />
              {t('confidence.certeza')}
            </li>
            <li>
              <span className="cds-review-swatch" data-mark="medium" aria-hidden="true" />
              {t('confidence.quase')}
            </li>
            <li>
              <span className="cds-review-swatch" data-mark="low" aria-hidden="true" />
              {t('confidence.duvida')}
            </li>
            <li>
              <span className="cds-review-swatch" data-mark="none" aria-hidden="true" />
              {t('rever.legend.outside')}
            </li>
            <li className="cds-review-legend-gap" aria-hidden="true" />
            <li>
              <span className="cds-review-swatch" data-mark="phrase-end" aria-hidden="true" />
              {t('rever.legend.phraseEnd')}
            </li>
            <li>
              <span className="cds-review-swatch" data-mark="scene-end" aria-hidden="true" />
              {t('rever.legend.sceneEnd')}
            </li>
          </ul>
        }
        next={{ label: t('rever.conclude'), onClick: conclude, enabled: true }}
      />

      <CoverageDrawer coverage={coverage} storyOverview={storyOverview} />
    </section>
  );
}

export default Review;
