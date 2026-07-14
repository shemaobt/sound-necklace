import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Player } from '../../../adapters/audio';
import { confirmWhole, reopenWhole } from '../../../domain';
import { Button, PlayGlyph } from '../../atoms';
import { Necklace, SIZE_L } from '../../organisms';
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
  const [heardEnough, setHeardEnough] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalBeads = session?.totalBeads ?? 0;
  const handlers = useMemo(
    () => (player ? makeTransportHandlers(player, totalBeads) : null),
    [player, totalBeads],
  );

  useEffect(() => {
    if (!player) return;
    return player.onHead((h) => {
      setHead(h);
      // protótipo heardEnough: a cabeça alcançou (quase) o fim → o pill acende
      if (h !== null && h >= totalBeads - 6) setHeardEnough(true);
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
        <ShemaIcon colorway="branco" size={380} />
      </div>

      <p className="cds-escuta1-tagline" data-role="instruction">
        {t('escuta1.tagline')}
      </p>

      <div className="cds-escuta1-stage">
        <Necklace
          totalBeads={totalBeads}
          beadSec={session.beadSec}
          size={SIZE_L}
          transportOnly
          playbackHead={head}
          onBeadPointerDown={handlers?.onBead}
          onHeadTap={handlers?.onHead}
        />
      </div>

      <div className="cds-escuta1-controls">
        <button
          type="button"
          className="cds-escuta1-play"
          aria-label={t('escuta1.listen')}
          onClick={handlers?.onBig}
        >
          <PlayGlyph state="play" size={28} />
        </button>

        <div
          className="cds-escuta1-decision"
          data-role="primary-action"
          data-heard={heardEnough || undefined}
        >
          {session.whole.confirmed ? (
            <Button key="reopen" variant="ghost" onClick={reopen}>
              {t('escuta1.reopen')}
            </Button>
          ) : (
            <button type="button" className="cds-escuta1-confirm" onClick={confirm}>
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {t('escuta1.confirm')}
            </button>
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
