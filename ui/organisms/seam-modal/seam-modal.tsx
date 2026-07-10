import * as Dialog from '@radix-ui/react-dialog';
import { useLayoutEffect, useRef } from 'react';

import type { BorderOffer, Span } from '../../../domain';
import { Button, Pearl } from '../../atoms';
import type { PaletteEntry } from '../../tokens';
import './seam-modal.css';

/**
 * Diálogo de travessia de borda (PRD v2 §8.6 + redesign §6.5 "1g"): overlay
 * olive com o trecho relevante do cordão e a costura deslizando, oferecendo
 * EXATAMENTE as opções que o domain classificou (`offer.canMove` decide o
 * mover; o modal nunca calcula limiares). Superfície do ouvinte (§9.2): a
 * question/warning do domain carregam dígitos e por isso NÃO são renderizadas
 * — delta/thr ficam internos; ESC e o overlay declinam para onReanchor, o
 * default que não muda nada (§9.5: guiar, nunca punir).
 */

const HEADLINE = 'A frase passou da borda da cena.';
const SUBLINE = 'Para onde vai a costura?';
const CONSEQUENCE = 'A cena de hoje cresce, a vizinha encolhe';
const MOVE = 'Mover a borda até aqui';
const MOVE_ANYWAY = 'Mover mesmo assim';
const BACK_TO_TRIAGEM = 'Voltar à Triagem';
const REANCHOR = 'Reancorar dentro da cena';

const BEAD = 46;
const GAP = 10;
const SLOT = BEAD + GAP;
const PAD = 3;

export interface SeamCordSide {
  span: Span;
  tint: PaletteEntry;
}

export interface SeamModalProps {
  offer: BorderOffer | null;
  /** A cena de hoje e a vizinha imediata do lado da travessia (null = a borda
   *  só estica a cena). A estação fornece spans + paleta; o modal só desenha. */
  scene: SeamCordSide;
  neighbor: SeamCordSide | null;
  onMove: () => void;
  onReanchor: () => void;
  onGoTriagem: () => void;
}

type Zone = 'scene' | 'overshoot' | 'neighbor';

interface StripModel {
  before: number;
  after: number;
  beads: { index: number; zone: Zone }[];
}

/** Janela pequena ao redor da emenda: contas da cena, as que passaram e a
 *  ponta da vizinha — clampada aos spans recebidos, mas SEMPRE incluindo a
 *  borda nova (seleção consumida pode passar além da vizinha inteira). */
function stripModel(
  offer: BorderOffer,
  scene: SeamCordSide,
  neighbor: SeamCordSide | null,
): StripModel {
  const before = offer.crossEnd ? scene.span.e : scene.span.s;
  const after = offer.crossEnd ? offer.sel.e : offer.sel.s;
  let lo = Math.min(before, after) - PAD;
  let hi = Math.max(before, after) + PAD;
  if (offer.crossEnd) {
    lo = Math.max(lo, scene.span.s);
    hi = Math.min(hi, neighbor ? Math.max(neighbor.span.e, after) : after);
  } else {
    hi = Math.min(hi, scene.span.e);
    lo = Math.max(lo, neighbor ? Math.min(neighbor.span.s, after) : after);
  }
  const beads: StripModel['beads'] = [];
  for (let index = lo; index <= hi; index += 1) {
    const zone: Zone = offer.crossEnd
      ? index <= scene.span.e
        ? 'scene'
        : index <= offer.sel.e
          ? 'overshoot'
          : 'neighbor'
      : index >= scene.span.s
        ? 'scene'
        : index >= offer.sel.s
          ? 'overshoot'
          : 'neighbor';
    beads.push({ index, zone });
  }
  return { before, after, beads };
}

function Marker({ kind, slideFromPx }: { kind: 'before' | 'after'; slideFromPx?: number }) {
  return (
    <span
      className="cds-seam-modal-marker"
      data-role={kind === 'before' ? 'seam-before' : 'seam-after'}
      style={
        slideFromPx === undefined ? undefined : { '--cds-seam-slide-from': `${slideFromPx}px` }
      }
    >
      <span className="cds-seam-modal-marker-label">
        {kind === 'before' ? 'borda de hoje' : 'borda nova'}
      </span>
    </span>
  );
}

export function SeamModal({
  offer,
  scene,
  neighbor,
  onMove,
  onReanchor,
  onGoTriagem,
}: SeamModalProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const reanchorWrapRef = useRef<HTMLSpanElement>(null);

  // centra o trecho na borda nova — janelas grandes (consumido) estouram a
  // largura e rolariam começando longe da emenda
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const marker = strip?.querySelector<HTMLElement>('[data-role="seam-after"]');
    if (strip && marker) strip.scrollLeft = marker.offsetLeft - strip.clientWidth / 2;
  }, [offer]);

  if (!offer) return null;

  const strip = stripModel(offer, scene, neighbor);
  // contas que passaram: miolo claro sobre a cor da cena (protótipo 1g)
  const overshootTint: PaletteEntry = { ...scene.tint, base: scene.tint.lit, lit: '#FFF6EC' };
  const tintFor = (zone: Zone): PaletteEntry =>
    zone === 'scene'
      ? scene.tint
      : zone === 'overshoot'
        ? overshootTint
        : (neighbor?.tint ?? scene.tint);

  const actions: { label: string; variant: 'primary' | 'ghost'; onClick: () => void }[] =
    offer.kind === 'simple'
      ? [
          { label: MOVE, variant: 'primary', onClick: onMove },
          { label: REANCHOR, variant: 'ghost', onClick: onReanchor },
        ]
      : [
          { label: BACK_TO_TRIAGEM, variant: 'primary', onClick: onGoTriagem },
          ...(offer.canMove
            ? [{ label: MOVE_ANYWAY, variant: 'ghost' as const, onClick: onMove }]
            : []),
          { label: REANCHOR, variant: 'ghost', onClick: onReanchor },
        ];

  const markerAt = (edge: 'lead' | 'trail', index: number) => {
    const side = offer.crossEnd ? 'trail' : 'lead';
    if (edge !== side) return null;
    if (index === strip.before) return <Marker kind="before" />;
    if (index === strip.after)
      return <Marker kind="after" slideFromPx={(strip.before - strip.after) * SLOT} />;
    return null;
  };

  return (
    <Dialog.Root open onOpenChange={(open) => (open ? undefined : onReanchor())}>
      <Dialog.Portal>
        <Dialog.Overlay className="cds-seam-modal-overlay" />
        <Dialog.Content
          className="cds-seam-modal"
          // foco inicial na ação menos destrutiva (APG; §9.5): Enter acidental
          // nunca move uma borda
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            reanchorWrapRef.current?.querySelector('button')?.focus();
          }}
        >
          <Dialog.Title className="cds-seam-modal-headline">{HEADLINE}</Dialog.Title>
          <Dialog.Description className="cds-seam-modal-subline">{SUBLINE}</Dialog.Description>
          <div className="cds-seam-modal-strip" ref={stripRef}>
            {strip.beads.map(({ index, zone }) => (
              <span key={index} className="cds-seam-modal-slot">
                {markerAt('lead', index)}
                <span className="cds-seam-modal-bead" data-zone={zone}>
                  <Pearl state="lit" tint={tintFor(zone)} size={BEAD} />
                </span>
                {markerAt('trail', index)}
              </span>
            ))}
          </div>
          <div className="cds-seam-modal-actions">
            {actions.map(({ label, variant, onClick }) => {
              const button = (
                <Button variant={variant} onClick={onClick}>
                  {label}
                </Button>
              );
              return label === REANCHOR ? (
                <span key={label} ref={reanchorWrapRef} style={{ display: 'contents' }}>
                  {button}
                </span>
              ) : (
                <span key={label} style={{ display: 'contents' }}>
                  {button}
                </span>
              );
            })}
          </div>
          {offer.kind === 'simple' ? (
            <p className="cds-seam-modal-consequence">{CONSEQUENCE}</p>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
