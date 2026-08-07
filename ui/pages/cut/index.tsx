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
  dragSelectionStart,
  removePart,
  setMode,
  type Span,
} from '../../../domain';
import { Button } from '../../atoms';
import { Necklace, type NecklaceSegment, SIZE_L, StationNav } from '../../organisms';
import { sessionStore, useSessionStore } from '../../state';
import {
  lockedItemAt,
  playClick,
  playEditWindow,
  rankLockedScenes,
  sceneColor,
  sceneOrdinal,
  START_HANDLE,
} from './cutting';
import { BeadStrip, type BeadStripItem } from '../../molecules';
import './cut.css';

/**
 * Escuta 2 — o corte de cenas (PRD v2 §8.4, redesign §6.3): palco creme, o colar
 * com ancoragem ativa e a instrução em dois tempos: toque onde a cena COMEÇA (a
 * história corre dali) e depois onde ela TERMINA. Desde 2026-08-07 não há
 * pré-ancoragem — o começo vem do 1º clique. Cada clique dá áudio na hora (§8.2).
 *
 * Camada de wiring: o modelo de clique delega ao redutor `clickBead`; travar
 * (`confirmPart`), arrastar a fronteira entre cenas (`dragSceneBoundary`, ENG-342 —
 * substitui o reabrir), confirmar tudo (`confirmParts` → Triage) e voltar (história
 * reaberta, cenas preservadas) são decisões puras do domínio aplicadas pelo
 * `sessionStore`. O áudio chega por prop.
 */
/**
 * Teto da janela de contas (ENG-387): 8 fileiras. Menos que a Escuta 1 porque
 * abaixo do colar ainda ficam o fio das cenas costuradas e a confirmação — e
 * numa história longa era justamente isso que sumia da tela.
 */
const NECKLACE_MAX_H = 8 * SIZE_L.row + 12;

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
  // Qual cena costurada abre a cápsula do rodapé — a seleção é da PÁGINA, o fio
  // de contas só a recebe e devolve o toque. Guardamos junto o `scope` em que ela
  // foi feita (ver abaixo).
  const [pick, setPick] = useState<{ scope: string; key: string } | null>(null);

  const parts = session?.parts ?? null;
  // Cenas travadas rankeadas pela posição no colar (bead inicial), não pela ordem
  // de criação: número, cor e ordem das contas seguem o que o ouvinte vê da esquerda
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
  // …e o COMEÇO da cena em definição (decisão do dono, 2026-08-06): arrastá-lo para
  // frente deixa o trecho anterior fora de qualquer cena. É assim que um erro de
  // fala do áudio cru fica de fora sem ser removido nem excluído do artefato.
  const anchoredStart = session && activeAnchor(session) ? (session.selection?.s ?? null) : null;
  const dragHandles = useMemo(() => {
    const ends = lockedScenes.map((sc) => ({ at: sc.span.e, id: sc.part.part_id }));
    return anchoredStart === null ? ends : [...ends, { at: anchoredStart, id: START_HANDLE }];
  }, [lockedScenes, anchoredStart]);

  useEffect(() => {
    if (!player) return;
    return player.onHead(setHead);
  }, [player]);

  useEffect(() => {
    if (!player) return;
    return () => player.stop();
  }, [player]);

  /**
   * A cápsula aponta para uma cena pelo `part_id`, e o domínio reatribui ids pelo
   * menor livre — um id apagado volta a existir noutra cena. Uma seleção que
   * sobreviva ao que ela aponta ofereceria "Remover" sobre outra cena.
   *
   * Por isso a escolha carrega o `scope` em que foi feita e só vale enquanto ele
   * durar: trocar de sessão (aberta ou retomada), de modo ou de âncora ativa a
   * invalida por construção, sem efeito nem render em cascata. Remover tem o seu
   * próprio zerar, porque ali o item some sem o scope mudar.
   */
  /* O separador é NUL escapado, não literal: escrito cru no fonte ele faz o
     arquivo deixar de ser texto (grep e `file` param de enxergá-lo). O valor em
     runtime é o mesmo, e nenhum slug consegue forjar a fronteira entre campos. */
  const scope = session
    ? `${session.slug}\u0000${session.manifestId}\u0000${session.mode}\u0000${session.current.layer}:${session.current.index}`
    : '';
  const picked = pick?.scope === scope ? pick.key : null;

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
   * porque senão o redutor tomaria o toque como marcação de começo/fim. Devolve true
   * quando a conta era de cena travada (o corte não corre).
   */
  const playLockedSceneAt = (bead: number): boolean => {
    const s = sessionStore.getState().session;
    const locked = s ? lockedItemAt(s.parts, bead) : null;
    if (!locked?.span) return false;
    player?.toggle(`${locked.part_id}:${bead}`, bead, locked.span.e);
    return true;
  };

  // DEFININDO uma cena (decisão do dono, 2026-08-07): o 1º clique marca o COMEÇO e a
  // história CORRE dali; o 2º marca o fim (parando só se o playhead já passou); daí em
  // diante o clique move a borda mais próxima e reouve o trecho resultante inteiro.
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
  // a seguinte SEGUE (Pac-Man). Sem reprime: desde 2026-08-07 o slot pendente não é
  // mais pré-ancorado — quem fixa o começo é o 1º clique.
  // Enquanto edita, toca a prévia ~4 contas antes do limite até ~3 depois (regra 5).
  const onDragBoundary = (id: string, toBead: number): void => {
    if (id === START_HANDLE) {
      sessionStore.getState().apply((s) => dragSelectionStart(s, toBead));
    } else {
      sessionStore.getState().apply((s) => dragSceneBoundary(s, id, toBead));
    }
    if (player) playEditWindow(player, toBead, session.totalBeads);
  };

  // Remover a cena + a SEGUINTE absorve o espaço liberado (#3): removePart é puro
  // (fiel ao reference, golden), a absorção é composta aqui — como o reprime.
  const removeScene = (partId: string): void => {
    setError(null);
    setPick(null);
    sessionStore.getState().apply((s) => {
      const removed = s.parts.find((p) => p.part_id === partId);
      const after = removePart(
        s,
        s.parts.findIndex((p) => p.part_id === partId),
      );
      return removed?.locked && removed.span ? absorbNextScene(after, removed.span.s) : after;
    });
  };

  /**
   * Uma conta por cena costurada, na ordem do colar (`lockedScenes` já vem
   * rankeada pelo bead inicial, ENG-344): a cor da conta e o número por extenso
   * saem do mesmo `rank`, senão o rodapé discordaria do que o ouvinte vê.
   * Sem `sub`: a duração seria um dígito na tela do ouvinte (§9.2).
   */
  const sceneBeads: BeadStripItem[] = lockedScenes.map((sc) => {
    const ordinal = sceneOrdinal(sc.rank, i18n.language);
    return {
      key: sc.part.part_id,
      label: ordinal ? t('cut.sceneLabel', { ordinal }) : t('cut.sceneLabelBare'),
      swatch: sceneColor(sc.rank),
      actions: (
        <Button variant="ghost" size="sm" onClick={() => removeScene(sc.part.part_id)}>
          {t('cut.remove')}
        </Button>
      ),
    };
  });

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
          maxHeight={NECKLACE_MAX_H}
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
          <div className="cds-cut-strip">
            <BeadStrip
              groupLabel={t('cut.stripAria')}
              items={sceneBeads}
              selected={picked}
              onSelect={(key) => setPick({ scope, key })}
            />
          </div>
        </>
      ) : null}

      {/* corpo = só os comandos DESTA página (protótipo v3 §2); trocar de página é
          assunto do rodapé. Aqui sobra o corte da cena corrente. */}
      {!tiled && anchor ? (
        <div className="cds-cut-controls">
          <div className="cds-cut-confirm-scene" data-role="primary-action">
            <Button variant="primary" onClick={confirmScene}>
              {t('cut.confirmScene')}
            </Button>
          </div>
        </div>
      ) : null}

      <StationNav
        back={{ label: t('cut.back'), onClick: back }}
        next={{
          label: tiled ? t('review.continue') : t('cut.confirmAll'),
          onClick: confirmAll,
          enabled: hasLocked,
        }}
      />

      {error ? (
        <p className="cds-cut-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export default Cut;
