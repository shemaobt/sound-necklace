import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Player } from '../../../adapters/audio';
import {
  activeAnchor,
  activeScene,
  type BorderOffer,
  clickBead,
  confirmFrase,
  confirmFrasesDone,
  enterScene,
  type Frase,
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
import { Necklace, type NecklaceSegment, SeamModal, type SeamCordSide } from '../../organisms';
import { sessionStore, useSessionStore } from '../../state';
import { playActionOn, sceneColor, sceneLabel } from '../escuta2/cutting';
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
}

export function Segmentacao({ player = null }: SegmentacaoProps) {
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
  const isLast = sceneIdx >= ps.length - 1;
  const anchor = activeAnchor(session);

  const onBead = (bead: number): void => {
    const s = sessionStore.getState().session;
    if (!s) return;
    const { state, play } = clickBead(s, bead);
    sessionStore.getState().apply(() => state);
    if (play && player) playActionOn(player, play);
  };

  const onEdgeHover = (edge: number): void => {
    if (player) player.playEdge(edge);
  };

  const playScene = (): void => {
    if (player) player.toggle(sc.part_id, scSpan.s, scSpan.e);
  };

  const playPhrase = (f: Frase): void => {
    if (player && f.span) player.toggle(f.prop_id, f.span.s, f.span.e);
  };

  const confirmPhrase = (): void => {
    const s = sessionStore.getState().session;
    if (!s || s.current.layer !== 'frases' || s.current.index < 0) return;
    const result = confirmFrase(s, s.current.index);
    switch (result.kind) {
      case 'error':
        setError(result.error.message);
        return;
      case 'border':
        setError(null);
        setOffer(result.offer);
        return;
      case 'locked':
        setError(null);
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
        return;
      case 'next-scene':
      case 'mapeamento':
        setError(null);
        setWarned(null);
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
      <p className="cds-segmentacao-title">{`${sceneLabel(sceneIdx)} · ${sceneKindLabel(sc.scene_kind!, i18n.language)}`}</p>
      <p className="cds-segmentacao-instruction" data-role="instruction">
        {t('segmentacao.instruction')}
      </p>

      <div className="cds-segmentacao-stage">
        <Necklace
          totalBeads={session.totalBeads}
          beadSec={session.beadSec}
          segments={segments}
          lockedEndBeads={lockedEndBeads}
          selection={session.selection}
          pendingStart={session.pendingStart}
          window={scSpan}
          playbackHead={head}
          onBeadPointerDown={onBead}
          onEdgeHover={onEdgeHover}
        />
      </div>

      <div className="cds-segmentacao-scene-controls">
        <Button variant="ghost" size="sm" onClick={playScene}>
          {t('segmentacao.playScene')}
        </Button>
      </div>

      {scenePhrases.length ? (
        <ul className="cds-segmentacao-chips">
          {scenePhrases.map(({ f, index }, pos) => (
            <li key={f.prop_id}>
              <ScenePhraseChip
                label={phraseLabel(pos)}
                swatch={phraseColor(pos)}
                onPlay={() => playPhrase(f)}
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
      ) : null}

      <div className="cds-segmentacao-controls">
        <Button variant="ghost" size="sm" onClick={back}>
          {t('segmentacao.back')}
        </Button>

        {anchor ? (
          <div className="cds-segmentacao-confirm" data-role="primary-action">
            <Button variant="primary" onClick={confirmPhrase}>
              {t('segmentacao.confirmPhrase')}
            </Button>
          </div>
        ) : null}

        <Button variant="dark" onClick={done}>
          {isLast ? t('segmentacao.doneLast') : t('segmentacao.doneMore')}
        </Button>
      </div>

      {error ? (
        <p className="cds-segmentacao-error" role="alert">
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
