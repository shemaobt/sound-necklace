import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Player } from '../../../adapters/audio';
import type { UiSound } from '../../../adapters/ui-sound';
import {
  activeAnchor,
  clickBead,
  confirmPart,
  confirmParts,
  reopenPart,
  setMode,
  type Span,
} from '../../../domain';
import { Button } from '../../atoms';
import { Necklace, type NecklaceSegment, SIZE_L } from '../../organisms';
import { sessionStore, useSessionStore } from '../../state';
import { lockedSceneAt, playActionOn, sceneColor, sceneLabel } from './cutting';
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

export interface Escuta2Props {
  player?: Player | null;
  /** A voz da UI (§9): travar uma cena, recusar um corte e avançar têm som. */
  sound?: UiSound;
}

export function Escuta2({ player = null, sound }: Escuta2Props) {
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
      lockedIndexes.map((i) => session.parts[i]!.span!),
      session.totalBeads,
    );

  /**
   * Tocar numa cena já travada a reproduz inteira — o `clickCut`/`_sceneOf` de
   * "Ouvir no colar" (o estudo `pure` escolhido, redesign §11; o arquivo chamado
   * "Protótipo" é o estudo VELHO e traz o oposto: play no chip e nenhum ramo de
   * cena travada). A Triagem faz o mesmo pelo colar da cena em foco. Vem ANTES do
   * `clickBead` porque o redutor é port 1:1 da referência v1: ele clampa o clique
   * até a emenda e, ao fazer isso, consome a pré-ancoragem da próxima cena. Levar
   * a regra para o domínio muda camada congelada — o golden é o juiz, não esta
   * estação. Devolve true quando a conta era de cena travada (o corte não corre).
   */
  const playLockedSceneAt = (bead: number): boolean => {
    const s = sessionStore.getState().session;
    const locked = s ? lockedSceneAt(s.parts, bead) : null;
    if (!locked?.span) return false;
    player?.toggle(locked.part_id, locked.span.s, locked.span.e);
    return true;
  };

  const onBead = (bead: number): void => {
    if (playLockedSceneAt(bead)) return;
    const s = sessionStore.getState().session;
    if (!s) return;
    const { state, play } = clickBead(s, bead);
    sessionStore.getState().apply(() => state);
    if (play && player) playActionOn(player, play);
  };

  /**
   * A conta que brilha pausa — o `_headTapPause` de "Ouvir no colar" (:697), que
   * também vem antes de decidir o que tocar. `play`/`playEdge` não têm chave (o
   * `playRange` a limpa), e só o `toggle` da MESMA chave pausa: sem o corte seco
   * abaixo, a cabeça acesa durante uma prévia de borda — cuja janela invade a cena
   * travada — cairia num `toggle` de chave alheia e RECOMEÇARIA a cena para quem
   * tocou querendo parar. Sem chave não há o que retomar, então é `stop`.
   */
  const onHeadTap = (): void => {
    if (!player) return;
    if (player.state.key === null) {
      player.stop();
      return;
    }
    if (head !== null) playLockedSceneAt(head);
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

  const reopen = (i: number): void => {
    setError(null);
    // a cena que estava tocando deixa de existir aqui: o áudio dela não sobrevive
    player?.stop();
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
            {hasLocked ? t('escuta2.instructionReplay') : t('escuta2.instructionPost')}
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
          onHeadTap={onHeadTap}
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
