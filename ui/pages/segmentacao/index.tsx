import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Player } from '../../../adapters/audio';
import type { UiSound } from '../../../adapters/ui-sound';
import {
  activeAnchor,
  activeScene,
  type BorderOffer,
  clickBead,
  confirmFrase,
  confirmFrasesDone,
  enterScene,
  moveBorder,
  nextNeighbor,
  prevNeighbor,
  productiveScenes,
  reanchorFrase,
  removeFrase,
  reopenFrase,
  sceneIndexOf,
  setMode,
  toggleFlag,
} from '../../../domain';
import { sceneKindLabel } from '../../i18n/scene-kind-label';
import { Button } from '../../atoms';
import { ScenePhraseChip } from '../../molecules';
import {
  Necklace,
  type NecklaceSegment,
  SeamModal,
  type SeamCordSide,
  SIZE_SEG,
} from '../../organisms';
import { resolveWindow } from '../../organisms/necklace/geometry';
import { sessionStore, useSessionStore } from '../../state';
import { lockedItemAt, playActionOn, sceneColor, sceneLabel } from '../escuta2/cutting';
import { phraseColor, phraseLabel } from './wiring';
import './segmentacao.css';

/**
 * Segmentação — as frases dentro de uma cena (PRD v2 §8.6, redesign §6.5): palco
 * creme, o colar em JANELA na cena produtiva ativa (cena ± margem, fora escurecido,
 * banda tracejada) e a frase ancorada pela fronteira do domínio (incl. back-reach
 * da 1ª frase). Cada clique dá áudio na hora (§8.2); "▶ ouvir a cena" toca só a
 * cena. A travessia de borda abre o seam-modal com a oferta que o domínio
 * classificou (mover desliza a costura e trava; reancorar limpa; escalada volta à
 * Triagem). Chips das frases travadas: ▶ · Reabrir · ⚑ revisar · Remover.
 *
 * Camada de wiring: o modelo de clique delega ao redutor `clickBead`; confirmar
 * (`confirmFrase`), mover (`moveBorder`), reancorar (`reanchorFrase`), sinalizar
 * (`toggleFlag`), remover (`removeFrase`), avançar (`confirmFrasesDone`) e voltar
 * (`enterScene`/`setMode`) são decisões puras do domínio aplicadas pelo
 * `sessionStore`. O áudio chega por prop; nada de shell/organismo/domínio muda.
 */
export interface SegmentacaoProps {
  player?: Player | null;
  /** A voz da UI (§9): travar a frase, mover a costura, recusar e avançar têm som. */
  sound?: UiSound;
}

export function Segmentacao({ player = null, sound }: SegmentacaoProps) {
  const { t, i18n } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const [head, setHead] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<BorderOffer | null>(null);
  const [warned, setWarned] = useState<string | null>(null);

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
    return { sc, scSpan: sc.span, scenePhrases, segments, lockedEndBeads };
  }, [session]);

  useEffect(() => {
    if (!player) return;
    return player.onHead(setHead);
  }, [player]);
  useEffect(() => {
    if (!player) return;
    return () => player.stop();
  }, [player]);

  if (!session || !derived) return null;
  const { sc, scSpan, scenePhrases, segments, lockedEndBeads } = derived;

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
   * Tocar numa frase já travada a reproduz inteira (ENG-296), como a Escuta 2 faz
   * com as cenas: o `clickBead` é port 1:1 da v1 e clamparia o toque até a emenda,
   * consumindo a pré-ancoragem da frase seguinte. Só as frases DESTA cena entram —
   * são as únicas na janela do colar.
   */
  const playLockedPhraseAt = (bead: number): boolean => {
    const locked = lockedItemAt(
      scenePhrases.map(({ f }) => f),
      bead,
    );
    if (!locked?.span) return false;
    player?.toggle(locked.prop_id, locked.span.s, locked.span.e);
    return true;
  };

  const onBead = (bead: number): void => {
    if (playLockedPhraseAt(bead)) return;
    const s = sessionStore.getState().session;
    if (!s) return;
    const { state, play } = clickBead(s, bead);
    sessionStore.getState().apply(() => state);
    if (play && player) playActionOn(player, play);
  };

  /** A conta acesa pausa — chave alheia reiniciaria a frase (ENG-297). */
  const onHeadTap = (): void => {
    if (!player) return;
    if (player.state.key === null) {
      player.stop();
      return;
    }
    if (head !== null) playLockedPhraseAt(head);
  };

  const onEdgeHover = (edge: number): void => {
    if (player) player.playEdge(edge);
  };

  const confirmPhrase = (): void => {
    const s = sessionStore.getState().session;
    if (!s || s.current.layer !== 'frases' || s.current.index < 0) return;
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

  const onGoTriagem = (): void => {
    setOffer(null);
    setError(null);
    sessionStore.getState().apply((s) => setMode(s, 'triagem'));
  };

  const reopen = (i: number): void => {
    setError(null);
    // a frase que estava tocando deixa de existir aqui: o áudio dela não sobrevive
    player?.stop();
    sessionStore.getState().apply((s) => reopenFrase(s, i));
  };

  const flag = (i: number): void => {
    sessionStore.getState().apply((s) => toggleFlag(s, i));
  };

  const remove = (i: number): void => {
    setError(null);
    sessionStore.getState().apply((s) => removeFrase(s, i));
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
        sound?.advance();
        sessionStore.getState().apply(() => result.state);
        return;
    }
  };

  const back = (): void => {
    setError(null);
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

  return (
    <section className="cds-segmentacao">
      <div className="cds-segmentacao-header">
        <p className="cds-segmentacao-title">
          <span
            className="cds-segmentacao-swatch"
            aria-hidden="true"
            style={{
              background: `radial-gradient(circle at 34% 30%, ${headerTint.lit} 0%, ${headerTint.base} 70%)`,
            }}
          />
          {`${sceneLabel(sceneIdx)} · ${sceneKindLabel(sc.scene_kind!, i18n.language)}`}
        </p>
        <p className="cds-segmentacao-instruction" data-role="instruction">
          {covered ? t('segmentacao.reviewHeadline') : t('segmentacao.instruction')}
          {!covered && scenePhrases.length > 0 ? t('segmentacao.instructionReplay') : null}
        </p>
      </div>

      <div className="cds-segmentacao-stage" style={{ maxWidth: stageMaxWidth }}>
        <Necklace
          totalBeads={session.totalBeads}
          beadSec={session.beadSec}
          segments={segments}
          lockedEndBeads={lockedEndBeads}
          selection={session.selection}
          pendingStart={session.pendingStart}
          size={SIZE_SEG}
          window={scSpan}
          playbackHead={head}
          onBeadPointerDown={onBead}
          onHeadTap={onHeadTap}
          onEdgeHover={onEdgeHover}
        />
      </div>

      {scenePhrases.length ? (
        <>
          <div className="cds-segmentacao-divider" aria-hidden="true" />
          <ul className="cds-segmentacao-chips">
            {scenePhrases.map(({ f, index }, pos) => (
              <li key={f.prop_id}>
                <ScenePhraseChip
                  label={phraseLabel(pos)}
                  swatch={phraseColor(pos)}
                  actions={
                    <>
                      <Button variant="ghost" size="sm" onClick={() => reopen(index)}>
                        {t('segmentacao.reopen')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => flag(index)}>
                        {f.flagged ? t('segmentacao.flagMarked') : t('segmentacao.flagReview')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(index)}>
                        {t('segmentacao.remove')}
                      </Button>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="cds-segmentacao-controls">
        <Button variant="ghost" size="sm" onClick={back}>
          {t('segmentacao.back')}
        </Button>

        {!covered && anchor ? (
          <div className="cds-segmentacao-confirm" data-role="primary-action">
            <Button variant="primary" onClick={confirmPhrase}>
              {t('segmentacao.confirmPhrase')}
            </Button>
          </div>
        ) : null}

        {covered ? (
          <div className="cds-segmentacao-confirm" data-role="primary-action">
            <Button variant="primary" onClick={done}>
              {t('review.continue')}
            </Button>
          </div>
        ) : (
          <Button variant="dark" onClick={done}>
            {isLast ? t('segmentacao.doneLast') : t('segmentacao.doneMore')}
          </Button>
        )}
      </div>

      {error ? (
        <p className="cds-segmentacao-error" role="alert" data-kind={warned ? 'warn' : 'error'}>
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
          onGoTriagem={onGoTriagem}
        />
      ) : null}
    </section>
  );
}

export default Segmentacao;
