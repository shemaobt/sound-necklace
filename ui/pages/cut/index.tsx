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
import { lockedItemAt, playActionOn, sceneColor, sceneLabel } from './cutting';
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
 * (`confirmPart`), reabrir em cascata (`reopenPart`), confirmar tudo
 * (`confirmParts` → Triage) e voltar (história reaberta, cenas preservadas) são
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

export interface CutProps {
  player?: Player | null;
  /** A voz da UI (§9): travar uma cena, recusar um corte e avançar têm som. */
  sound?: UiSound;
}

export function Cut({ player = null, sound }: CutProps) {
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
   * cena travada). A Triage faz o mesmo pelo colar da cena em foco. Vem ANTES do
   * `clickBead` porque o redutor é port 1:1 da referência v1: ele clampa o clique
   * até a emenda e, ao fazer isso, consome a pré-ancoragem da próxima cena. Levar
   * a regra para o domínio muda camada congelada — o golden é o juiz, não esta
   * estação. Devolve true quando a conta era de cena travada (o corte não corre).
   */
  const playLockedSceneAt = (bead: number): boolean => {
    const s = sessionStore.getState().session;
    const locked = s ? lockedItemAt(s.parts, bead) : null;
    if (!locked?.span) return false;
    // Toca da conta TOCADA até o fim da cena, com a chave por conta (ENG-347):
    // tocar OUTRA conta é chave nova → pula na hora (nada de esperar acabar);
    // tocar a MESMA é a mesma chave → pausa/retoma no lugar.
    player?.toggle(`${locked.part_id}:${bead}`, bead, locked.span.e);
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
    const activeKey = player.state.key;
    if (activeKey === null) {
      player.stop();
      return;
    }
    // A conta acesa pausa/retoma no lugar a cena que já toca (mesma chave → o
    // adapter suspende/retoma; s/e ignorados). NÃO re-derivamos a chave do
    // playhead móvel: como agora a chave carrega a conta de partida (ENG-347),
    // usar `head` viraria uma chave nova e RECOMEÇARIA a cena para quem tocou
    // querendo parar.
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

  const reopen = (i: number): void => {
    setError(null);
    // a cena que estava tocando deixa de existir aqui: o áudio dela não sobrevive
    player?.stop();
    sessionStore.getState().apply((s) => reopenPart(s, i));
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
          onBeadPointerDown={onBead}
          onHeadTap={onHeadTap}
          onEdgeHover={onEdgeHover}
        />
      </div>

      {hasLocked ? (
        <>
          <div className="cds-cut-divider" aria-hidden="true" />
          <ul className="cds-cut-chips">
            {lockedIndexes.map((i) => {
              const pt = session.parts[i]!;
              return (
                <li key={pt.part_id}>
                  <ScenePhraseChip
                    label={sceneLabel(i)}
                    swatch={sceneColor(i)}
                    actions={
                      <Button variant="ghost" size="sm" onClick={() => reopen(i)}>
                        {t('cut.reopen')}
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
