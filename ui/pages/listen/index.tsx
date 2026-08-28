import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Player } from '../../../adapters/audio';
import type { UiSound } from '../../../adapters/ui-sound';
import { confirmWhole } from '../../../domain';
import { Necklace, SIZE_L, StationNav } from '../../organisms';
import { progressStore, sessionStore, useSessionStore } from '../../state';
import { ShemaIcon } from '../../tokens';
import { makeTransportHandlers } from './transport';
import './listen.css';

/**
 * Escuta 1 — a abertura cerimonial (PRD v2 §8.3, redesign §6.2): fundo olive
 * full-bleed, "Ouça a história." em Merriweather itálico, o colar como transporte
 * e a decisão única "Já ouvi a história completa" (uma vez confirmada, a Escuta 2
 * assume; reabrir a história vive no "← Voltar" do Cortar — ENG-342).
 *
 * Camada de wiring: lê a sessão do domínio pelo `sessionStore` e recebe o `Player`
 * de transporte por prop (injeção da estação/teste; o áudio só é ligado pelo Setup
 * — ENG-243 — então em runtime, sem player, o colar renderiza sem playback).
 */
/**
 * Teto da janela de contas (ENG-387): a história inteira cabe em 9 fileiras e o
 * resto rola ali dentro — a decisão "Já ouvi a história completa" nunca é
 * empurrada para fora da tela por uma história longa.
 */
const NECKLACE_MAX_H = 9 * SIZE_L.row + 12;

export interface ListenProps {
  player?: Player | null;
  /** A voz da UI (§9): confirmar a escuta avança; sem ouvir tudo, recusa. */
  sound?: UiSound;
}

export function Listen({ player = null, sound }: ListenProps) {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const [head, setHead] = useState<number | null>(null);
  const [heardEnough, setHeardEnough] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heard = useRef(new Set<number>());

  const totalBeads = session?.totalBeads ?? 0;
  const handlers = useMemo(
    () => (player ? makeTransportHandlers(player, totalBeads) : null),
    [player, totalBeads],
  );

  useEffect(() => {
    if (!player) return;
    return player.onHead((h) => {
      setHead(h);
      if (h === null) return;
      // "ouviu o bastante" = a cabeça percorreu ~toda a história (cobertura
      // cumulativa das contas visitadas), não apenas alcançou o fim: amostrar as
      // últimas contas não é ter ouvido. A folga de 10% absorve o frame perdido.
      heard.current.add(h);
      // a barra da história no topo mede a Escuta pelo mesmo número (ENG-648)
      progressStore.getState().noteHeard(heard.current.size);
      if (heard.current.size >= totalBeads * 0.9) setHeardEnough(true);
    });
  }, [player, totalBeads]);

  useEffect(() => {
    if (!player) return;
    return () => player.stop();
  }, [player]);

  if (!session) return null;

  const confirm = (): void => {
    const result = confirmWhole(session);
    if (!result.ok) {
      setError(result.error.message);
      sound?.refuse();
      return;
    }
    setError(null);
    sound?.advance();
    sessionStore.getState().apply(() => result.state);
  };

  return (
    <section className="cds-listen">
      <div className="cds-listen-watermark" aria-hidden="true">
        <ShemaIcon colorway="branco" size={380} />
      </div>

      <p className="cds-listen-tagline" data-role="instruction">
        {t('listen.tagline')}
      </p>

      <div className="cds-listen-stage">
        <Necklace
          totalBeads={totalBeads}
          beadSec={session.beadSec}
          size={SIZE_L}
          maxHeight={NECKLACE_MAX_H}
          transportOnly
          playbackHead={head}
          onBeadPointerDown={handlers?.onBead}
          onHeadTap={handlers?.onHead}
        />
      </div>

      {/* "Já ouvi a história completa" saiu do corpo e virou o Avançar do rodapé
          (protótipo v3 §2): aqui ficam título, colar e o play. */}
      {error ? (
        <div className="cds-listen-controls">
          <p className="cds-listen-error" role="alert">
            {error}
          </p>
        </div>
      ) : null}

      {/* história confirmada → só revisão (a Escuta 2 assumiu); reabrir a história
          vive no "← Voltar" do Cortar, não aqui (ENG-342). */}
      {session.whole.confirmed ? null : (
        <StationNav next={{ label: t('listen.confirm'), onClick: confirm, enabled: heardEnough }} />
      )}
    </section>
  );
}

export default Listen;
