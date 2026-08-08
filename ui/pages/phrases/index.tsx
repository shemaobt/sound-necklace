import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Player } from '../../../adapters/audio';
import type { UiSound } from '../../../adapters/ui-sound';
import {
  absorbNextFrase,
  activeAnchor,
  activeScene,
  type BorderOffer,
  clickBead,
  confirmFrase,
  confirmFrasesDone,
  dragPhraseBoundary,
  dragSelectionStart,
  enterScene,
  moveBorder,
  nextNeighbor,
  prevNeighbor,
  productiveScenes,
  reanchorFrase,
  removeFrase,
  sceneIndexOf,
  setMode,
} from '../../../domain';
import { sceneKindLabel } from '../../i18n/scene-kind-label';
import { Button } from '../../atoms';
import { BeadStrip, type BeadStripItem } from '../../molecules';
import {
  Necklace,
  type NecklaceSegment,
  SeamModal,
  type SeamCordSide,
  SIZE_SEG,
  StationNav,
} from '../../organisms';
import { resolveWindow } from '../../organisms/necklace/geometry';
import { sessionStore, useSessionStore } from '../../state';
import {
  lockedItemAt,
  playClick,
  playEditWindow,
  playHoverEdge,
  sceneColor,
  sceneLabel,
  START_HANDLE,
} from '../cut/cutting';
import { phraseColor, phraseLabel } from './wiring';
import './phrases.css';

/**
 * Segmentação — as frases dentro de uma cena (PRD v2 §8.6, redesign §6.5): palco
 * creme, o colar em JANELA na cena produtiva ativa (cena ± margem, fora escurecido,
 * banda tracejada) e a frase marcada em dois toques (começo, depois fim), com o
 * clique saturado na fronteira do domínio (incl. back-reach da 1ª frase). Cada clique dá áudio na hora (§8.2); "▶ ouvir a cena" toca só a
 * cena. A travessia de borda abre o seam-modal com a oferta que o domínio
 * classificou (mover desliza a costura e trava; reancorar limpa; escalada volta à
 * Triage). Fio de contas das frases travadas: Remover; ajuste pós-fato é arrastar
 * a borda no colar (dragPhraseBoundary, ENG-342 — reabrir/⚑ removidos).
 *
 * Camada de wiring: o modelo de clique delega ao redutor `clickBead`; confirmar
 * (`confirmFrase`), mover (`moveBorder`), reancorar (`reanchorFrase`), arrastar a
 * borda (`dragPhraseBoundary`), remover (`removeFrase`), avançar
 * (`confirmFrasesDone`) e voltar (`enterScene`/`setMode`) são decisões puras do
 * domínio aplicadas pelo `sessionStore`. O áudio chega por prop.
 */
/**
 * Teto da janela de contas (ENG-387): uma tira de 6 fileiras. A Segmentação é a
 * mais curta das estações porque a moldura tracejada abraça o colar e o fio das
 * frases vem logo abaixo — uma cena longa rola dentro da tira, não na página.
 */
const NECKLACE_MAX_H = 6 * SIZE_SEG.row + 12;

export interface PhrasesProps {
  player?: Player | null;
  /** A voz da UI (§9): travar a frase, mover a costura, recusar e avançar têm som. */
  sound?: UiSound;
}

export function Phrases({ player = null, sound }: PhrasesProps) {
  const { t, i18n } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const [head, setHead] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<BorderOffer | null>(null);
  const [warned, setWarned] = useState<string | null>(null);
  // Qual frase costurada abre a cápsula do rodapé — a seleção é da PÁGINA, o fio
  // de contas só a recebe e devolve o toque. Guardamos junto o `scope` em que ela
  // foi feita (ver abaixo).
  const [pick, setPick] = useState<{ scope: string; key: string } | null>(null);

  // Tudo o que a tela deriva da sessão num único memo por `session` (ref estável
  // entre frames de playback → o campo do colar não recomputa quando só a cabeça
  // anda). As frases travadas DESTA cena carregam o índice global (reabrir/
  // sinalizar/remover); `segments`/`lockedEndBeads` pintam o colar.
  const derived = useMemo(() => {
    if (!session) return null;
    const sc = activeScene(session);
    if (!sc || !sc.span) return null;
    const scenePhrases = session.frases
      .map((f, index) => ({ f, index }))
      .filter(({ f }) => f.locked && f.span && f.part_link === sc.part_id);
    const segments: NecklaceSegment[] = scenePhrases.map(({ f }, pos) => ({
      span: f.span!,
      tint: phraseColor(pos),
    }));
    const lockedEndBeads = scenePhrases.map(({ f }) => f.span!.e);
    // Punhos de arrasto (ENG-342): só o FIM de cada frase travada — estritamente
    // como as cenas (decisão do dono, simetria cena↔frase). O começo é a emenda e
    // NÃO arrasta; ao arrastar o fim, a frase SEGUINTE segue (Pac-Man, sem vão),
    // igual à cena. `id` = o índice global da frase.
    const dragHandles = scenePhrases.map(({ f, index }) => ({ at: f.span!.e, id: `${index}` }));
    // …e o COMEÇO da frase em definição (decisão do dono, 2026-08-06): arrastá-lo
    // para frente deixa o trecho anterior fora de qualquer frase — é assim que um
    // erro de fala fica de fora sem ser removido nem excluído do artefato.
    if (activeAnchor(session) && session.selection) {
      dragHandles.push({ at: session.selection.s, id: START_HANDLE });
    }
    return { sc, scSpan: sc.span, scenePhrases, segments, lockedEndBeads, dragHandles };
  }, [session]);

  useEffect(() => {
    if (!player) return;
    return player.onHead(setHead);
  }, [player]);
  useEffect(() => {
    if (!player) return;
    return () => player.stop();
  }, [player]);

  /**
   * A cápsula aponta para uma frase pelo `prop_id`, e o domínio reatribui ids
   * pelo menor livre — um id apagado volta a existir noutra frase. Uma seleção
   * que sobreviva ao que ela aponta ofereceria "Remover" sobre outra frase.
   *
   * Por isso a escolha carrega o `scope` em que foi feita e só vale enquanto ele
   * durar: trocar de sessão (aberta ou retomada), de modo ou de cena ativa a
   * invalida por construção, sem efeito nem render em cascata. Remover tem o seu
   * próprio zerar, porque ali o item some sem o scope mudar.
   */
  /* Separador NUL, escapado e não literal: cru no fonte ele faz o arquivo deixar
     de ser texto — grep e `file` param de enxergá-lo. O valor em runtime é o
     mesmo, e nenhum slug consegue forjar a fronteira entre os campos. */
  const scope = session
    ? `${session.slug}\u0000${session.manifestId}\u0000${session.mode}\u0000${session.activeSceneId ?? ''}`
    : '';
  const picked = pick?.scope === scope ? pick.key : null;

  if (!session || !derived) return null;
  const { sc, scSpan, scenePhrases, segments, lockedEndBeads, dragHandles } = derived;

  const ps = productiveScenes(session);
  const sceneIdx = Math.max(0, sceneIndexOf(session, sc.part_id));
  const headerTint = sceneColor(session.parts.findIndex((p) => p.part_id === sc.part_id));
  // momento de revisão (decisão do dono): frases travadas cobrindo a cena toda →
  // nada resta a cortar aqui; UMA ação (Continuar = o mesmo confirmFrasesDone,
  // que sem cena vazia não avisa). Frases esparsas mantêm o botão do PRD.
  // a moldura tracejada abraça a janela renderizada: contas visíveis × slot + respiro
  const { winS, winE } = resolveWindow(session.totalBeads, session.beadSec, scSpan);
  const stageMaxWidth = Math.min(22, winE - winS + 1) * SIZE_SEG.slot + 63;

  const lockedPhraseEnds = scenePhrases
    .filter(({ f }) => f.locked && f.span)
    .map(({ f }) => f.span!.e);
  const covered = lockedPhraseEnds.length > 0 && Math.max(...lockedPhraseEnds) === scSpan.e;
  const isLast = sceneIdx >= ps.length - 1;
  const anchor = activeAnchor(session);

  /**
   * Tocar numa frase já CONFIRMADA reproduz A PARTIR da conta clicada até o fim da
   * frase (regra 4, idêntico à cena). Chave por conta: outra conta pula, a mesma
   * pausa/retoma. Só as frases DESTA cena entram — são as únicas na janela do colar.
   */
  const playLockedPhraseAt = (bead: number): boolean => {
    const locked = lockedItemAt(
      scenePhrases.map(({ f }) => f),
      bead,
    );
    if (!locked?.span) return false;
    player?.toggle(`${locked.prop_id}:${bead}`, bead, locked.span.e);
    return true;
  };

  // DEFININDO uma frase: o MESMO modelo das cenas — 1º clique marca o começo e a cena
  // corre dali, 2º marca o fim, e daí em diante a borda mais próxima cede e o trecho
  // resultante toca inteiro.
  const onBead = (bead: number): void => {
    if (playLockedPhraseAt(bead)) return;
    const s = sessionStore.getState().session;
    if (!s) return;
    const { state, play } = clickBead(s, bead);
    sessionStore.getState().apply(() => state);
    if (play && player) playClick(player, play, scSpan.e, head);
  };

  /** A conta acesa pausa. Sem chave (listen/set-end/transporte tocam via `play`,
   *  sem chave) → `stop`. Com chave (frase confirmada por `toggle`) → pausa/retoma
   *  pela chave ATIVA. */
  const onHeadTap = (): void => {
    if (!player) return;
    const activeKey = player.state.key;
    if (activeKey === null) {
      player.stop();
      return;
    }
    player.toggle(activeKey, head ?? 0, head ?? 0);
  };

  // A lupa da borda só vale no SILÊNCIO: som em curso manda (decisão do dono,
  // 2026-08-07 — o dwell vinha cortando o áudio do clique).
  const onEdgeHover = (edge: number): void => {
    if (player) playHoverEdge(player, edge);
  };

  const confirmPhrase = (): void => {
    const s = sessionStore.getState().session;
    if (!s || s.current.layer !== 'frases' || s.current.index < 0) return;
    // Confirmar com o começo marcado e o fim ainda não (pendingStart não-nulo)
    // travaria uma frase de UMA conta — o guarda pede o 2º toque, como confirmPart.
    if (s.pendingStart !== null) {
      setError(t('phrases.halfSelection'));
      sound?.refuse();
      return;
    }
    const result = confirmFrase(s, s.current.index);
    switch (result.kind) {
      case 'error':
        setError(result.error.message);
        sound?.refuse();
        return;
      case 'border':
        setError(null);
        setOffer(result.offer);
        return;
      case 'locked':
        setError(null);
        sound?.lock();
        sessionStore.getState().apply(() => result.state);
        return;
      case 'noop':
        return;
    }
  };

  const onMove = (): void => {
    if (!offer) return;
    setError(null);
    setOffer(null);
    sound?.lock();
    // moveBorder deve rodar sobre o MESMO estado (mesma cena ativa) que gerou a
    // oferta — o store não muda enquanto o modal está aberto (§8.6).
    sessionStore.getState().apply((s) => moveBorder(s, offer));
  };

  const onReanchor = (): void => {
    setOffer(null);
    sessionStore.getState().apply((s) => reanchorFrase(s));
  };

  const onGoTriage = (): void => {
    setOffer(null);
    setError(null);
    sessionStore.getState().apply((s) => setMode(s, 'triagem'));
  };

  // Arrastar o FIM de uma frase (ENG-342, substitui o reabrir/⚑): `id` = o índice
  // global da frase. `primeFrase` reancora a frase pendente na nova fronteira
  // depois do ajuste — senão, com a frase antes cobrindo o fim do colar (fronteira
  // fora da grade), o clique seguinte fecharia além do colar e o confirm cospe
  // "A frase precisa terminar dentro do colar" (#3).
  const onDragBoundary = (id: string, toBead: number): void => {
    if (id === START_HANDLE) {
      sessionStore.getState().apply((s) => dragSelectionStart(s, toBead));
    } else {
      sessionStore.getState().apply((s) => dragPhraseBoundary(s, Number(id), toBead));
    }
    if (player) playEditWindow(player, toBead, session.totalBeads);
  };

  // Remover a frase + a SEGUINTE da mesma cena absorve o espaço (#3): removeFrase
  // é puro (fiel ao reference, golden), a absorção é composta aqui — como o reprime.
  const remove = (i: number): void => {
    setError(null);
    setPick(null);
    sessionStore.getState().apply((s) => {
      const removed = s.frases[i];
      const after = removeFrase(s, i);
      return removed?.locked && removed.span && removed.part_link
        ? absorbNextFrase(after, removed.part_link, removed.span.s)
        : after;
    });
  };

  const done = (): void => {
    const s = sessionStore.getState().session;
    if (!s) return;
    const result = confirmFrasesDone(s, warned);
    switch (result.kind) {
      case 'noop':
        return;
      case 'warn-empty':
        setWarned(result.warnedEmptyScene);
        setError(result.message);
        sound?.refuse();
        return;
      case 'next-scene':
      case 'mapeamento':
        setError(null);
        setWarned(null);
        // sair da cena esvazia o rodapé: chegar noutra cena (ou voltar a esta)
        // com uma cápsula já aberta é herdar a escolha de outro momento
        setPick(null);
        sound?.advance();
        sessionStore.getState().apply(() => result.state);
        return;
    }
  };

  const back = (): void => {
    setError(null);
    setPick(null);
    const s = sessionStore.getState().session;
    if (!s) return;
    const scenes = productiveScenes(s);
    const cur = activeScene(s);
    const idx = sceneIndexOf(s, cur?.part_id ?? null);
    const prev = idx > 0 ? scenes[idx - 1] : undefined;
    if (prev) sessionStore.getState().apply(() => enterScene(s, prev.part_id));
    else sessionStore.getState().apply(() => setMode(s, 'triagem'));
  };

  // seam-modal: a cena de hoje + a vizinha imediata do lado da travessia
  const partTint = (id: string): SeamCordSide['tint'] =>
    sceneColor(session.parts.findIndex((p) => p.part_id === id));
  const neighbor = offer
    ? offer.crossEnd
      ? nextNeighbor(session, sc)
      : prevNeighbor(session, sc)
    : null;
  const sceneSide: SeamCordSide = { span: scSpan, tint: partTint(sc.part_id) };
  const neighborSide: SeamCordSide | null = neighbor
    ? { span: neighbor.span, tint: partTint(neighbor.part_id) }
    : null;

  /**
   * Uma conta por frase costurada, na ordem em que aparecem na cena: a cor e o
   * número por extenso saem da mesma posição `pos`, senão o rodapé discordaria
   * do que o ouvinte vê no colar. Sem `sub`: a duração seria um dígito na tela
   * do ouvinte (§9.2).
   */
  const phraseBeads: BeadStripItem[] = scenePhrases.map(({ f, index }, pos) => ({
    key: f.prop_id,
    label: phraseLabel(pos),
    swatch: phraseColor(pos),
    actions: (
      <Button variant="ghost" size="sm" onClick={() => remove(index)}>
        {t('phrases.remove')}
      </Button>
    ),
  }));

  return (
    <section className="cds-phrases">
      <div className="cds-phrases-header">
        <p className="cds-phrases-title">
          <span
            className="cds-phrases-swatch"
            aria-hidden="true"
            style={{
              background: `radial-gradient(circle at 34% 30%, ${headerTint.lit} 0%, ${headerTint.base} 70%)`,
            }}
          />
          {`${sceneLabel(sceneIdx)} · ${sceneKindLabel(sc.scene_kind!, i18n.language)}`}
        </p>
        <p className="cds-phrases-instruction" data-role="instruction">
          {covered ? t('phrases.reviewHeadline') : t('phrases.instruction')}
          {!covered && scenePhrases.length > 0 ? t('phrases.instructionReplay') : null}
        </p>
      </div>

      <div className="cds-phrases-stage" style={{ maxWidth: stageMaxWidth }}>
        <Necklace
          totalBeads={session.totalBeads}
          beadSec={session.beadSec}
          segments={segments}
          lockedEndBeads={lockedEndBeads}
          selection={session.selection}
          pendingStart={session.pendingStart}
          size={SIZE_SEG}
          maxHeight={NECKLACE_MAX_H}
          window={scSpan}
          playbackHead={head}
          dragHandles={dragHandles}
          onBeadPointerDown={onBead}
          onHeadTap={onHeadTap}
          onEdgeHover={onEdgeHover}
          onDragBoundary={onDragBoundary}
        />
      </div>

      {scenePhrases.length ? (
        <>
          <div className="cds-phrases-divider" aria-hidden="true" />
          <div className="cds-phrases-strip">
            <BeadStrip
              groupLabel={t('phrases.stripAria')}
              items={phraseBeads}
              selected={picked}
              onSelect={(key) => setPick({ scope, key })}
            />
          </div>
        </>
      ) : null}

      {/* corpo = só o comando desta página: fechar a frase corrente (v3 §2) */}
      {!covered && anchor ? (
        <div className="cds-phrases-controls">
          <div className="cds-phrases-confirm" data-role="primary-action">
            <Button variant="primary" onClick={confirmPhrase}>
              {t('phrases.confirmPhrase')}
            </Button>
          </div>
        </div>
      ) : null}

      <StationNav
        back={{ label: t('phrases.back'), onClick: back }}
        next={{
          label: covered
            ? t('review.continue')
            : isLast
              ? t('phrases.doneLast')
              : t('phrases.doneMore'),
          onClick: done,
          // "Pronto com esta cena" nunca trava: cena sem frase avisa e deixa seguir
          // no segundo clique (referência `confirmFrasesDone`, L917-925).
          enabled: true,
        }}
      />

      {error ? (
        <p className="cds-phrases-error" role="alert" data-kind={warned ? 'warn' : 'error'}>
          {error}
        </p>
      ) : null}

      {offer ? (
        <SeamModal
          offer={offer}
          scene={sceneSide}
          neighbor={neighborSide}
          onMove={onMove}
          onReanchor={onReanchor}
          onGoTriage={onGoTriage}
        />
      ) : null}
    </section>
  );
}

export default Phrases;
