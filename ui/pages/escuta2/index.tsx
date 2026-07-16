import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Player } from '../../../adapters/audio';
import {
  activeAnchor,
  clickBead,
  confirmPart,
  confirmParts,
  reopenPart,
  setMode,
} from '../../../domain';
import { Button } from '../../atoms';
import { Necklace, type NecklaceSegment, SIZE_L } from '../../organisms';
import { sessionStore, useSessionStore } from '../../state';
import { playActionOn, sceneColor, sceneLabel } from './cutting';
import { ScenePhraseChip } from '../../molecules';
import './escuta2.css';

/**
 * Escuta 2 — o corte de cenas (PRD v2 §8.4, redesign §6.3): palco creme, o colar
 * com ancoragem ativa e a instrução única "Toque no colar onde ESTA CENA TERMINA.
 * O começo já está costurado." O usuário decide só o FIM — o início vem
 * pré-ancorado na emenda pelo domínio (`primePart`). Cada clique dá áudio na hora
 * (§8.2): a conta, o intervalo ou só a janela da fronteira ajustada.
 *
 * Camada de wiring: o modelo de clique delega ao redutor `clickBead`; travar
 * (`confirmPart`), reabrir em cascata (`reopenPart`), confirmar tudo
 * (`confirmParts` → Triagem) e voltar (história reaberta, cenas preservadas) são
 * decisões puras do domínio aplicadas pelo `sessionStore`. O áudio chega por prop.
 */
export interface Escuta2Props {
  player?: Player | null;
}

export function Escuta2({ player = null }: Escuta2Props) {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const [head, setHead] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parts = session?.parts ?? null;
  const segments = useMemo<NecklaceSegment[]>(
    () =>
      (parts ?? []).flatMap((p, i) =>
        p.locked && p.span ? [{ span: p.span, tint: sceneColor(i) }] : [],
      ),
    [parts],
  );
  const lockedEndBeads = useMemo<number[]>(
    () => (parts ?? []).flatMap((p) => (p.locked && p.span ? [p.span.e] : [])),
    [parts],
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
  const lockedIndexes = session.parts.flatMap((p, i) => (p.locked && p.span ? [i] : []));
  const hasLocked = lockedIndexes.length > 0;
  // momento de revisão (decisão do dono): a história toda coberta por cenas
  // travadas → nada resta a cortar; a âncora residual do domínio fica oculta
  // (confirmParts a descarta, PRD §8.4) e a tela oferece UMA ação: Continuar.
  const tiled =
    hasLocked &&
    Math.max(...lockedIndexes.map((i) => session.parts[i]!.span!.e)) === session.totalBeads - 1;

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

  const confirmScene = (): void => {
    const s = sessionStore.getState().session;
    if (!s || s.current.layer !== 'parts' || s.current.index < 0) return;
    const result = confirmPart(s, s.current.index);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    sessionStore.getState().apply(() => result.state);
  };

  const confirmAll = (): void => {
    const s = sessionStore.getState().session;
    if (!s) return;
    const result = confirmParts(s);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
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

  const reopen = (i: number): void => {
    setError(null);
    sessionStore.getState().apply((s) => reopenPart(s, i));
  };

  return (
    <section className="cds-escuta2">
      <div className="cds-escuta2-header">
        <h2 className="cds-escuta2-title">{t('escuta2.title')}</h2>
        {tiled ? (
          <p className="cds-escuta2-instruction" data-role="instruction">
            {t('escuta2.reviewHeadline')}
          </p>
        ) : (
          <p className="cds-escuta2-instruction" data-role="instruction">
            {t('escuta2.instructionPre')}
            <span className="cds-escuta2-emph">{t('escuta2.instructionEmph')}</span>
            {t('escuta2.instructionPost')}
          </p>
        )}
      </div>

      <div className="cds-escuta2-stage">
        <Necklace
          totalBeads={session.totalBeads}
          beadSec={session.beadSec}
          segments={segments}
          lockedEndBeads={lockedEndBeads}
          selection={session.selection}
          pendingStart={session.pendingStart}
          size={SIZE_L}
          playbackHead={head}
          onBeadPointerDown={onBead}
          onEdgeHover={onEdgeHover}
        />
      </div>

      {hasLocked ? (
        <>
          <div className="cds-escuta2-divider" aria-hidden="true" />
          <ul className="cds-escuta2-chips">
            {lockedIndexes.map((i) => {
              const pt = session.parts[i]!;
              return (
                <li key={pt.part_id}>
                  <ScenePhraseChip
                    label={sceneLabel(i)}
                    swatch={sceneColor(i)}
                    actions={
                      <Button variant="ghost" size="sm" onClick={() => reopen(i)}>
                        {t('escuta2.reopen')}
                      </Button>
                    }
                  />
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <div className="cds-escuta2-controls">
        <Button variant="ghost" size="sm" onClick={back}>
          {t('escuta2.back')}
        </Button>

        {tiled ? (
          <div className="cds-escuta2-confirm-scene" data-role="primary-action">
            <Button variant="primary" onClick={confirmAll}>
              {t('review.continue')}
            </Button>
          </div>
        ) : null}

        {!tiled && anchor ? (
          <div className="cds-escuta2-confirm-scene" data-role="primary-action">
            <Button variant="primary" onClick={confirmScene}>
              {t('escuta2.confirmScene')}
            </Button>
          </div>
        ) : null}

        {hasLocked && !tiled ? (
          <Button variant="dark" onClick={confirmAll}>
            {t('escuta2.confirmAll')}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="cds-escuta2-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export default Escuta2;
