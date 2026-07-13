import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Player } from '../../../adapters/audio';
import { confirmWhole, reopenWhole } from '../../../domain';
import { Button, PlayGlyph } from '../../atoms';
import { Necklace } from '../../organisms';
import { sessionStore, useSessionStore } from '../../state';
import { ShemaIcon } from '../../tokens';
import { makeTransportHandlers } from './transport';
import './escuta1.css';

/**
 * Escuta 1 — a abertura cerimonial (PRD v2 §8.3, redesign §6.2): fundo olive
 * full-bleed, "Ouça a história." em Merriweather itálico, o colar como transporte
 * e a decisão única "Já ouvi a história completa" (com "Reabrir" que reverte).
 *
 * Camada de wiring: lê a sessão do domínio pelo `sessionStore` e recebe o `Player`
 * de transporte por prop (injeção da estação/teste; o áudio só é ligado pelo Setup
 * — ENG-243 — então em runtime, sem player, o colar renderiza sem playback).
 */
export interface Escuta1Props {
  player?: Player | null;
}

export function Escuta1({ player = null }: Escuta1Props) {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const [head, setHead] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalBeads = session?.totalBeads ?? 0;
  const handlers = useMemo(
    () => (player ? makeTransportHandlers(player, totalBeads) : null),
    [player, totalBeads],
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

  const confirm = (): void => {
    const result = confirmWhole(session);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    sessionStore.getState().apply(() => result.state);
  };

  const reopen = (): void => {
    setError(null);
    sessionStore.getState().apply(reopenWhole);
  };

  return (
    <section className="cds-escuta1">
      <div className="cds-escuta1-watermark" aria-hidden="true">
        <ShemaIcon colorway="branco" size={420} />
      </div>

      <p className="cds-escuta1-tagline" data-role="instruction">
        {t('escuta1.tagline')}
      </p>

      <div className="cds-escuta1-stage">
        <Necklace
          totalBeads={totalBeads}
          beadSec={session.beadSec}
          transportOnly
          playbackHead={head}
          onBeadPointerDown={handlers?.onBead}
          onHeadTap={handlers?.onHead}
        />
      </div>

      <div className="cds-escuta1-controls">
        <Button variant="dark" onClick={handlers?.onBig}>
          <PlayGlyph state="play" />
          {t('escuta1.listen')}
        </Button>

        <div className="cds-escuta1-decision" data-role="primary-action">
          {session.whole.confirmed ? (
            <Button variant="ghost" onClick={reopen}>
              {t('escuta1.reopen')}
            </Button>
          ) : (
            <Button variant="primary" onClick={confirm}>
              {t('escuta1.confirm')}
            </Button>
          )}
        </div>

        {error ? (
          <p className="cds-escuta1-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default Escuta1;
