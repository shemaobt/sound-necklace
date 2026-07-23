import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Player } from '../../../adapters/audio';
import type { UiSound } from '../../../adapters/ui-sound';
import {
  computeCoverage,
  type Confidence,
  enterSegmentacao,
  lockedParts,
  markNoneFit,
  type ScenePart,
  setMode,
  tagScene,
  triagemDone,
} from '../../../domain';
import { sceneKindLabel } from '../../i18n/scene-kind-label';
import { sceneColor } from '../cut/cutting';
import { Button } from '../../atoms';
import { ProgressDots } from '../../molecules';
import { Necklace, SIZE_L } from '../../organisms';
import { CoverageDrawer } from '../../organisms/coverage-drawer/coverage-drawer';
import { TriagePicker } from '../../organisms/triage-picker/triage-picker';
import { sessionStore, useSessionStore } from '../../state';
import './triage.css';

/**
 * Triage — classificar cada cena travada (PRD v2 §8.5, redesign §6.4): uma cena
 * por vez com pontos de progresso que também saltam o foco, "▶ Ouvir esta cena",
 * o estado atual sempre visível (por classificar / tipo + confiança / ⌀ nenhum se
 * encaixa), o picker por cena, a gaveta de cobertura só-facilitadora e o gate duro
 * "Já classifiquei todas as cenas →" (habilita só com todas não-pendentes E ≥1
 * produtiva). Marcar "nenhum se encaixa" é um ACHADO, não um beco: quando NENHUMA
 * cena se encaixa, Segmentação/Conversation ficam travadas e a tela explica.
 *
 * Camada de wiring: classificar (`tagScene`), marcar achado (`markNoneFit`),
 * o gate (`triagemDone` + `setMode`→`enterSegmentacao`) e a cobertura
 * (`computeCoverage`) são decisões puras do domínio aplicadas pelo `sessionStore`;
 * o picker e a gaveta são organismos presentacionais. O áudio chega por prop.
 */
export interface TriageProps {
  player?: Player | null;
  /** A voz da UI (§9): escolher um tipo, travar a cena e avançar têm som. */
  sound?: UiSound;
}

type Translate = (key: string) => string;

/** Rótulo de confiança para o estado atual (referência L1211; sem dígitos, §9.2). */
function confLabel(c: Confidence | null, t: Translate): string {
  if (c === 'high') return t('triage.confAlta');
  if (c === 'medium') return t('triage.confMedia');
  if (c === 'low') return t('triage.confBaixa');
  return '';
}

/** Estado atual da cena em foco, sempre visível (PRD v2 §8.5). */
function tagShow(scene: ScenePart, t: Translate, lang: string): string {
  if (scene.tag_state === 'none_fit') return t('triage.tagNoneFit');
  if (scene.tag_state === 'tagged' && scene.scene_kind)
    return `${sceneKindLabel(scene.scene_kind, lang)} · ${confLabel(scene.scene_kind_confidence, t)}`;
  return t('triage.tagPending');
}

/** Próxima cena pendente a partir de `from`, dando a volta (referência do protótipo). */
function nextPending(parts: ScenePart[], from: number): number {
  for (let i = from; i < parts.length; i++) if (parts[i]!.tag_state === 'pending') return i;
  for (let i = 0; i < parts.length; i++) if (parts[i]!.tag_state === 'pending') return i;
  return -1;
}

export function Triage({ player = null, sound }: TriageProps) {
  const { t, i18n } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const [focusIdx, setFocusIdx] = useState(0);
  const [inspecting, setInspecting] = useState<number | null>(null);
  const [head, setHead] = useState<number | null>(null);

  useEffect(() => {
    if (!player) return;
    return player.onHead(setHead);
  }, [player]);

  useEffect(() => {
    if (!player) return;
    return () => player.stop();
  }, [player]);

  const view = useMemo(() => {
    if (!session) return null;
    return {
      parts: lockedParts(session),
      coverage: computeCoverage(session),
      gate: triagemDone(session),
    };
  }, [session]);

  if (!session || !view) return null;
  const { parts, coverage, gate } = view;

  if (parts.length === 0) {
    return (
      <section className="cds-triage">
        <p className="cds-triage-empty">{t('triage.empty')}</p>
      </section>
    );
  }

  const idx = Math.min(focusIdx, parts.length - 1);
  const scene = parts[idx]!;
  // momento de revisão (decisão do dono): todas classificadas + ≥1 produtiva →
  // UMA ação (Continuar). Clicar num ponto reabre o picker daquela cena
  // (inspecting); classificar de novo volta à revisão sozinho.
  const reviewing = gate.enabled && inspecting === null;

  const advanceFocus = (): void => {
    const s = sessionStore.getState().session;
    if (!s) return;
    const nx = nextPending(lockedParts(s), idx + 1);
    if (nx >= 0) setFocusIdx(nx);
  };

  const classify = (kind: string, confidence: Confidence): void => {
    const id = scene.part_id;
    sound?.lock();
    sessionStore.getState().apply((s) => tagScene(s, id, kind, confidence));
    setInspecting(null);
    advanceFocus();
  };

  // protótipo tapTriageBead: tocar QUALQUER conta da cena reproduz a cena inteira
  // (e tocar a conta que brilha pausa — o `toggle` já faz isso na mesma chave).
  const playScene = (): void => {
    if (!player || !scene.span) return;
    player.toggle(scene.part_id, scene.span.s, scene.span.e);
  };

  const noneFit = (): void => {
    const id = scene.part_id;
    sound?.lock();
    sessionStore.getState().apply((s) => markNoneFit(s, id));
    setInspecting(null);
    advanceFocus();
  };

  // O gate compõe o `setMode` puro com a entrada de camada da referência
  // (L1006–1008): só quando o modo efetivo é phrases (há produtiva) roda
  // `enterSegmentacao`. Sob o gate só habilitado com produtiva, o ramo é certo.
  const advance = (): void => {
    const s = sessionStore.getState().session;
    if (!s || !triagemDone(s).enabled) return;
    sound?.advance();
    sessionStore.getState().apply((st) => {
      const moved = setMode(st, 'segmentacao');
      return moved.mode === 'segmentacao' ? enterSegmentacao(moved) : moved;
    });
  };

  return (
    <section className="cds-triage">
      <ProgressDots
        count={parts.length}
        current={idx}
        scenes={parts.map((p, i) => ({
          state:
            p.tag_state === 'tagged'
              ? 'tagged'
              : p.tag_state === 'none_fit'
                ? 'none_fit'
                : 'pending',
          tint: sceneColor(i),
        }))}
        onSelect={(i) => {
          setFocusIdx(i);
          setInspecting(i);
        }}
        dotLabel={t('progressDots.dotLabel')}
      />

      {reviewing ? (
        <div className="cds-triage-review" data-role="primary-action">
          <p className="cds-triage-review-headline" data-role="instruction">
            {t('triage.reviewHeadline')}
          </p>
          <Button variant="primary" onClick={advance}>
            {t('review.continue')}
          </Button>
        </div>
      ) : (
        <div className="cds-triage-focus">
          <p className="cds-triage-instruction" data-role="instruction">
            {t('triage.instruction')}
          </p>
          <p className="cds-triage-tag" data-tag={scene.tag_state}>
            {tagShow(scene, t, i18n.language)}
          </p>

          {/* o colar da cena em foco (protótipo tColarRows): sem play na estação, é
              daqui que sai o som — qualquer conta reproduz a cena inteira. Só a cena
              (windowMargin 0), sem a banda tracejada, que é afordância da Segmentação. */}
          {scene.span ? (
            <div className="cds-triage-colar">
              <div
                className="cds-triage-colar-card"
                // o cartão abraça a cena (protótipo: fit-content), em vez de virar uma
                // barra larga com quatro contas perdidas no meio. Teto de 30 contas por
                // fileira = o `_rowsWithFill(beads, 30)` do protótipo.
                style={{
                  maxWidth: Math.min(30, scene.span.e - scene.span.s + 1) * SIZE_L.slot + 44,
                }}
              >
                <Necklace
                  totalBeads={session.totalBeads}
                  beadSec={session.beadSec}
                  segments={[{ span: scene.span, tint: sceneColor(idx) }]}
                  window={scene.span}
                  windowMargin={0}
                  sceneBand={false}
                  size={SIZE_L}
                  transportOnly
                  playbackHead={head}
                  onBeadPointerDown={playScene}
                  onHeadTap={playScene}
                />
              </div>
              <p className="cds-triage-colar-hint">{t('triage.colarHint')}</p>
            </div>
          ) : null}

          <TriagePicker key={scene.part_id} onConfirm={classify} onNoneFit={noneFit} />
        </div>
      )}

      {coverage.noneFit > 0 ? <p className="cds-triage-finding">{t('triage.finding')}</p> : null}

      {coverage.allNoneFit ? (
        <p className="cds-triage-lockout" role="status">
          {t('triage.lockout')}
        </p>
      ) : null}

      {/* o CTA antigo virou o Continuar da revisão; aqui fica só o guia do gate */}
      {!gate.enabled && gate.message ? (
        <div className="cds-triage-gate">
          <p className="cds-triage-gate-msg" role="status">
            {gate.message}
          </p>
        </div>
      ) : null}

      {/* Inspecionando uma cena com o gate JÁ aberto, a saída fica aqui — como o CTA
          do protótipo, que vive no rodapé e não depende do picker. Sem isto, tocar
          num ponto só para reouvir a cena (que é para isso que o colar está lá)
          sumia com a única ação de avanço, e o único jeito de voltar a ela era
          RECLASSIFICAR uma cena que ninguém queria mexer. */}
      {gate.enabled && !reviewing ? (
        <div className="cds-triage-gate" data-role="primary-action">
          <Button variant="primary" onClick={advance}>
            {t('review.continue')}
          </Button>
        </div>
      ) : null}

      <CoverageDrawer coverage={coverage} />
    </section>
  );
}

export default Triage;
