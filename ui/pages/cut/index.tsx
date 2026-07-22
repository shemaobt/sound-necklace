import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Player } from '../../../adapters/audio';
import type { UiSound } from '../../../adapters/ui-sound';
import {
  absorbNextScene,
  activeAnchor,
  clickBead,
  confirmPart,
  confirmParts,
  dragSceneBoundary,
  primePart,
  removePart,
  setMode,
  type Span,
} from '../../../domain';
import { Button } from '../../atoms';
import { Necklace, type NecklaceSegment, SIZE_L } from '../../organisms';
import { sessionStore, useSessionStore } from '../../state';
import {
  lockedItemAt,
  playClick,
  playEditWindow,
  rankLockedScenes,
  sceneColor,
  sceneOrdinal,
} from './cutting';
import { ScenePhraseChip } from '../../molecules';
import './cut.css';

/**
 * Escuta 2 — o corte de cenas (PRD v2 §8.4, redesign §6.3): palco creme, o colar
 * com ancoragem ativa e a instrução única "Toque no colar onde ESTA CENA TERMINA.
 * O começo já está costurado." O usuário decide só o FIM — o início vem
 * pré-ancorado na emenda pelo domínio (`primePart`). Cada clique dá áudio na hora
 * (§8.2): a conta, o intervalo ou só a janela da fronteira ajustada.
 *
 * Camada de wiring: o modelo de clique delega ao redutor `clickBead`; travar
 * (`confirmPart`), arrastar a fronteira entre cenas (`dragSceneBoundary`, ENG-342 —
 * substitui o reabrir), confirmar tudo (`confirmParts` → Triage) e voltar (história
 * reaberta, cenas preservadas) são decisões puras do domínio aplicadas pelo
 * `sessionStore`. O áudio chega por prop.
 */
/** As cenas cobrem 0…N-1 sem buraco? (ladrilham a história inteira) */
function tilesWholeStory(spans: Span[], totalBeads: number): boolean {
  const ordered = [...spans].sort((a, b) => a.s - b.s);
  let next = 0;
  for (const span of ordered) {
    if (span.s > next) return false; // buraco: um trecho ficou sem cena
    next = Math.max(next, span.e + 1);
  }
  return next >= totalBeads;
}

export interface CutProps {
  player?: Player | null;
  /** A voz da UI (§9): travar uma cena, recusar um corte e avançar têm som. */
  sound?: UiSound;
}

export function Cut({ player = null, sound }: CutProps) {
  const { t, i18n } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const [head, setHead] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parts = session?.parts ?? null;
  // Cenas travadas rankeadas pela posição no colar (bead inicial), não pela ordem
  // de criação: número, cor e ordem dos chips seguem o que o ouvinte vê da esquerda
  // para a direita, mesmo num retorno salvo com `parts` fora de ordem (ENG-344).
  const lockedScenes = useMemo(() => rankLockedScenes(parts ?? []), [parts]);
  const segments = useMemo<NecklaceSegment[]>(
    () => lockedScenes.map((sc) => ({ span: sc.span, tint: sceneColor(sc.rank) })),
    [lockedScenes],
  );
  const lockedEndBeads = useMemo<number[]>(
    () => lockedScenes.map((sc) => sc.span.e),
    [lockedScenes],
  );
  // Punhos de arrasto (ENG-342): o FIM de cada cena travada, inclusive a última
  // (#2 — como a frase, o fim arrasta livre até o fim do colar). `id` = a cena
  // cujo fim se move; o domínio (`dragSceneBoundary`) empurra a vizinha por span
  // ou, na última, deixa a cobertura ficar esparsa.
  const dragHandles = useMemo(
    () => lockedScenes.map((sc) => ({ at: sc.span.e, id: sc.part.part_id })),
    [lockedScenes],
  );

  useEffect(() => {
    if (!player) return;
    return player.onHead(setHead);
  }, [player]);

  useEffect(() => {
    if (!player) return;
    return () => player.stop();
  }, [player]);

  if (!session) return null;

  const anchor = activeAnchor(session);
  const hasLocked = lockedScenes.length > 0;
  // momento de revisão (decisão do dono): a história toda coberta por cenas
  // travadas → nada resta a cortar; a âncora residual do domínio fica oculta
  // (confirmParts a descarta, PRD §8.4) e a tela oferece UMA ação: Continuar.
  //
  // A cobertura é AFERIDA, não inferida da última conta: o corte normal é
  // sequencial, mas um retorno salvo traz `parts` travadas direto do JSON, com
  // spans quaisquer (contracts/imports.ts). Bastava a última cena terminar no fim
  // do colar para a tela jurar "está toda em cenas", esconder o "Confirmar esta
  // cena" e deixar o trecho não cortado inalcançável — que o `confirmParts`
  // descarta em silêncio. Coberto = as cenas ladrilham 0…N-1 sem buraco.
  const tiled =
    hasLocked &&
    tilesWholeStory(
      lockedScenes.map((sc) => sc.span),
      session.totalBeads,
    );

  /**
   * Tocar numa cena já CONFIRMADA (travada) reproduz A PARTIR da conta clicada até
   * o fim da cena (regra 4, docs/segmentation-rules.md). Chave por conta:
   * tocar OUTRA conta pula para ela; a MESMA pausa/retoma. Vem ANTES do `clickBead`
   * porque o redutor consumiria a pré-ancoragem da próxima cena. Devolve true
   * quando a conta era de cena travada (o corte não corre).
   */
  const playLockedSceneAt = (bead: number): boolean => {
    const s = sessionStore.getState().session;
    const locked = s ? lockedItemAt(s.parts, bead) : null;
    if (!locked?.span) return false;
    player?.toggle(`${locked.part_id}:${bead}`, bead, locked.span.e);
    return true;
  };

  // DEFININDO uma cena (regras 1–3): clicar o começo OUVE a história a partir dali;
  // clicar além define o FIM (para se o playhead já passou, senão continua). O
  // começo é a fronteira, nunca settável (regra 7). O playhead entra por `head`.
  const onBead = (bead: number): void => {
    if (playLockedSceneAt(bead)) return;
    const s = sessionStore.getState().session;
    if (!s) return;
    const { state, play } = clickBead(s, bead);
    sessionStore.getState().apply(() => state);
    if (play && player) playClick(player, play, s.whole.span.e, head);
  };

  /**
   * A conta que brilha pausa. Sem chave ativa (um `listen`/`set-end`/transporte
   * toca SEM chave via `play`) não há o que retomar → `stop`. Com chave (uma cena
   * confirmada tocando por `toggle`) re-tocar a MESMA chave pausa/retoma no lugar
   * — usamos a chave ATIVA, não uma re-derivada do playhead móvel.
   */
  const onHeadTap = (): void => {
    if (!player) return;
    const activeKey = player.state.key;
    if (activeKey === null) {
      player.stop();
      return;
    }
    player.toggle(activeKey, head ?? 0, head ?? 0);
  };

  const onEdgeHover = (edge: number): void => {
    if (player) player.playEdge(edge);
  };

  const confirmScene = (): void => {
    const s = sessionStore.getState().session;
    if (!s || s.current.layer !== 'parts' || s.current.index < 0) return;
    const result = confirmPart(s, s.current.index);
    if (!result.ok) {
      setError(result.error.message);
      sound?.refuse();
      return;
    }
    setError(null);
    sound?.lock();
    sessionStore.getState().apply(() => result.state);
  };

  const confirmAll = (): void => {
    const s = sessionStore.getState().session;
    if (!s) return;
    const result = confirmParts(s);
    if (!result.ok) {
      setError(result.error.message);
      sound?.refuse();
      return;
    }
    setError(null);
    sound?.advance();
    sessionStore.getState().apply(() => result.state);
  };

  const back = (): void => {
    setError(null);
    // Port fiel do `cenasBack` da referência (index.html L903 → setMode('escuta')
    // com whole desconfirmado → L1014 reseta current p/ a camada da história). O
    // `setMode` do domínio é puro e não orquestra camada, então compomos o reset.
    sessionStore
      .getState()
      .apply((s) =>
        setMode(
          { ...s, whole: { ...s.whole, confirmed: false }, current: { layer: 'whole', index: -1 } },
          'escuta',
        ),
      );
  };

  // Arrastar o fim de uma cena (ENG-342): a cena `id` cresce/encolhe até `toBead`,
  // a seguinte SEGUE (Pac-Man). `primePart` reancora a pendente na nova fronteira.
  // Enquanto edita, toca a prévia ~4 contas antes do limite até ~3 depois (regra 5).
  const onDragBoundary = (id: string, toBead: number): void => {
    sessionStore.getState().apply((s) => primePart(dragSceneBoundary(s, id, toBead)));
    if (player) playEditWindow(player, toBead, session.totalBeads);
  };

  // Remover a cena + a SEGUINTE absorve o espaço liberado (#3): removePart é puro
  // (fiel ao reference, golden), a absorção é composta aqui — como o reprime.
  const removeScene = (partId: string): void => {
    setError(null);
    sessionStore.getState().apply((s) => {
      const removed = s.parts.find((p) => p.part_id === partId);
      const after = removePart(
        s,
        s.parts.findIndex((p) => p.part_id === partId),
      );
      return removed?.locked && removed.span ? absorbNextScene(after, removed.span.s) : after;
    });
  };

  return (
    <section className="cds-cut">
      <div className="cds-cut-header">
        <h2 className="cds-cut-title">{t('cut.title')}</h2>
        {tiled ? (
          <p className="cds-cut-instruction" data-role="instruction">
            {t('cut.reviewHeadline')}
          </p>
        ) : (
          <p className="cds-cut-instruction" data-role="instruction">
            {t('cut.instructionPre')}
            <span className="cds-cut-emph">{t('cut.instructionEmph')}</span>
            {hasLocked ? t('cut.instructionReplay') : t('cut.instructionPost')}
          </p>
        )}
      </div>

      <div className="cds-cut-stage">
        <Necklace
          totalBeads={session.totalBeads}
          beadSec={session.beadSec}
          segments={segments}
          lockedEndBeads={lockedEndBeads}
          selection={session.selection}
          pendingStart={session.pendingStart}
          size={SIZE_L}
          playbackHead={head}
          dragHandles={dragHandles}
          onBeadPointerDown={onBead}
          onHeadTap={onHeadTap}
          onEdgeHover={onEdgeHover}
          onDragBoundary={onDragBoundary}
        />
      </div>

      {hasLocked ? (
        <>
          <div className="cds-cut-divider" aria-hidden="true" />
          <ul className="cds-cut-chips">
            {lockedScenes.map((sc) => {
              const ordinal = sceneOrdinal(sc.rank, i18n.language);
              return (
                <li key={sc.part.part_id}>
                  <ScenePhraseChip
                    label={ordinal ? t('cut.sceneLabel', { ordinal }) : t('cut.sceneLabelBare')}
                    swatch={sceneColor(sc.rank)}
                    actions={
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeScene(sc.part.part_id)}
                      >
                        {t('cut.remove')}
                      </Button>
                    }
                  />
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <div className="cds-cut-controls">
        <Button variant="ghost" size="sm" onClick={back}>
          {t('cut.back')}
        </Button>

        {tiled ? (
          <div className="cds-cut-confirm-scene" data-role="primary-action">
            <Button variant="primary" onClick={confirmAll}>
              {t('review.continue')}
            </Button>
          </div>
        ) : null}

        {!tiled && anchor ? (
          <div className="cds-cut-confirm-scene" data-role="primary-action">
            <Button variant="primary" onClick={confirmScene}>
              {t('cut.confirmScene')}
            </Button>
          </div>
        ) : null}

        {hasLocked && !tiled ? (
          <Button variant="dark" onClick={confirmAll}>
            {t('cut.confirmAll')}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="cds-cut-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export default Cut;
