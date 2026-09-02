import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Player } from '../../../adapters/audio';
import type { UiSound } from '../../../adapters/ui-sound';
import { lockedParts, type Frase, type ScenePart, type Span } from '../../../domain';
import { sceneKindLabel } from '../../i18n/scene-kind-label';
import { ScenePearl, type ScenePearlFill } from '../../molecules';
import {
  type ClosedBlock,
  Necklace,
  type NecklaceSegment,
  SIZE_EXPORT,
  StationNav,
} from '../../organisms';
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
 * Concluir avisa o shell (`onBlockClosed('historia')`), que sobe a tela oliva.
 * Nesta fatia a sessão NÃO é marcada como concluída no servidor (fatia 2).
 */

/** O aviso some sozinho depois de um tempo (protótipo `_wt`, 9 s). */
const WARN_MS = 9000;

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
}

function fillOf(part: ScenePart): ScenePearlFill {
  return part.tag_state === 'tagged' && part.scene_kind_confidence
    ? part.scene_kind_confidence
    : 'none';
}

export function Review({ player = null, sound, onBlockClosed }: ReviewProps) {
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
    return { scenes, segments, lockedEndBeads, phraseEndBeads };
  }, [session]);

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
  const { scenes, segments, lockedEndBeads, phraseEndBeads } = derived;

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
    </section>
  );
}

export default Review;
