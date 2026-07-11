import { useEffect, useState } from 'react';
import * as RadioGroup from '@radix-ui/react-radio-group';

import { AudioDecodeError, type AudioEngine } from '../../../adapters/audio';
import type { BucketSource } from '../../../adapters/bucket';
import type { GranularityResolver } from '../../../adapters/granularity';
import type { SessionStore } from '../../../adapters/sessions';
import { type BucketAudio, type GranularityLevel, toSessionDto } from '../../../contracts';
import { buildBeads, createSession, hashPCM } from '../../../domain';
import { navigate as routerNavigate } from '../../app/router';
import { sessionStore } from '../../state';
import { defaultAudioEngine, defaultBucket, defaultResolver, defaultSessionStore } from './ports';
import './setup.css';

/**
 * Estação Setup (PRD v2 §8.1, redesign §6.1): a criação de sessão. Superfície de
 * FACILITADORA (§7.2, texto mais denso permitido). Escolhe um áudio do bucket (§7.4,
 * com o indicador de consentimento de coleta §12/O6), um NÍVEL de granularidade
 * (Pequena/Média/Grande — sem campo numérico de segundos, §6.1/§8.1), nomeia a
 * história (fallback = nome do arquivo) e confirma o consentimento de uso no
 * pipeline. Ao criar: decode → grade + manifest_id client-side → SessionStore.create
 * → persiste o estado inicial → carrega a sessão viva → Escuta 1 (`mode='escuta'`).
 *
 * As três portas de entrada (§8.9) e os três cards de nível usam Radix radio-group
 * (foco em roteta + ARIA de graça); o visual são os tokens Shemá. As duas portas de
 * importação levam à estação de arquivos do pipeline (ENG-248).
 *
 * Camada de wiring: as portas chegam por prop nos testes; em produção resolvem os
 * singletons fixture (ports.ts). O `navigate` é injetável para o teste observar a
 * navegação assíncrona sem tocar o histórico.
 */

/** §O7 — a linha de confiança fixada e proeminente. */
export const SETUP_TRUST_LINE =
  'Seus áudios e respostas ficam guardados com segurança no seu projeto. Só a sua equipe tem acesso.';

/** §6.1 — o sentido do aviso de grade da referência, preservado sem o campo numérico. */
export const SETUP_GRID_WARNING =
  'Trave o tamanho da conta antes de ancorar. Mudá-lo depois desloca as fronteiras.';

const NO_AUDIO_MSG = 'Escolha um arquivo de áudio primeiro.';
const NO_CONSENT_MSG = 'Confirme o consentimento de uso no pipeline para continuar.';
const NO_BEADSEC_MSG = 'Não consegui definir o tamanho da conta para este áudio.';
const CREATE_FAILED_MSG = 'Não foi possível criar a sessão. Tente de novo.';

type Door = 'zero' | 'entrega' | 'retorno';

const DOORS: readonly { value: Door; title: string; desc: string }[] = [
  { value: 'zero', title: 'Começar do zero', desc: 'Escolher um áudio e ancorar de ouvido.' },
  { value: 'entrega', title: 'Confirmar uma entrega', desc: 'Carregar propostas do projeto.' },
  { value: 'retorno', title: 'Retomar um retorno', desc: 'Continuar de um retorno salvo.' },
];

const LEVELS: readonly { value: GranularityLevel; title: string; desc: string }[] = [
  { value: 'pequena', title: 'Pequena', desc: 'contas mais curtas' },
  { value: 'media', title: 'Média', desc: 'equilíbrio' },
  { value: 'grande', title: 'Grande', desc: 'contas mais longas' },
];

export interface SetupProps {
  bucket?: BucketSource;
  resolver?: GranularityResolver;
  audioEngine?: AudioEngine;
  store?: SessionStore;
  /** Projeto dono da sessão; em produção vem da auth (follow-up do composition root). */
  projectId?: string;
  navigate?: (to: string) => void;
}

function decodeErrorMessage(e: unknown): string {
  const detail = e instanceof Error ? e.message : String(e);
  return `Não consegui decodificar este áudio (${detail}). Tente um WAV PCM.`;
}

export function Setup({
  bucket = defaultBucket(),
  resolver = defaultResolver(),
  audioEngine = defaultAudioEngine(),
  store = defaultSessionStore(),
  projectId = 'projeto',
  navigate = routerNavigate,
}: SetupProps) {
  const [audios, setAudios] = useState<BucketAudio[] | null>(null);
  const [door, setDoor] = useState<Door>('zero');
  const [audioId, setAudioId] = useState<string | null>(null);
  const [level, setLevel] = useState<GranularityLevel>('media');
  const [title, setTitle] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void bucket.list().then((list) => {
      if (alive) setAudios(list);
    });
    return () => {
      alive = false;
    };
  }, [bucket]);

  const create = async (): Promise<void> => {
    setError(null);
    const audio = audios?.find((a) => a.id === audioId) ?? null;
    if (!audio) {
      setError(NO_AUDIO_MSG);
      return;
    }
    if (!consent) {
      setError(NO_CONSENT_MSG);
      return;
    }
    // Fronteira da AÇÃO do usuário: uma criação orquestra várias portas de IO
    // (fetch/decode/create/flush). O try/catch/finally aqui garante que `busy`
    // SEMPRE reabilita o botão; a falha esperada e tipada do decode vira a cópia
    // §8.1, e qualquer outra falha de sistema vira a orientação genérica (nenhuma
    // trava silenciosa). Grade/hash/createSession são puros — não lançam aqui.
    setBusy(true);
    try {
      const { beadSec } = resolver.resolve(level, audio.acousteme);
      if (!(beadSec > 0)) {
        setError(NO_BEADSEC_MSG);
        return;
      }

      const bytes = await bucket.fetchBytes(audio.id);
      const decoded = await audioEngine.decode(bytes);

      const beads = buildBeads(decoded.duration, beadSec);
      const manifestId = hashPCM(decoded.pcm, beadSec);
      const name = title.trim() || audio.filename.replace(/\.[^.]+$/, '') || 'colar';

      const summary = await store.create({
        projectId,
        storyName: name,
        storySlug: name,
        audioId: audio.id,
        granularityLevel: level,
        beadSec,
        manifestId,
        pipelineConsent: consent,
      });

      const state = createSession({
        durationSec: decoded.duration,
        beadSec,
        beads,
        manifestId,
        audioFilename: audio.filename,
        slug: name,
      });
      sessionStore.getState().load(state);
      store.autosave(
        summary.id,
        toSessionDto(state, {
          granularityLevel: level,
          bucketAudioId: audio.id,
          voice: [],
          pipelineConsent: consent,
        }),
      );
      await store.flush(summary.id);

      navigate(`/session/${summary.id}`);
    } catch (e) {
      setError(e instanceof AudioDecodeError ? decodeErrorMessage(e) : CREATE_FAILED_MSG);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cds-setup">
      <h1 className="cds-setup-title">Nova sessão</h1>
      <p className="cds-setup-trust" role="note">
        {SETUP_TRUST_LINE}
      </p>

      <RadioGroup.Root
        className="cds-setup-doors"
        aria-label="Como começar"
        value={door}
        onValueChange={(v) => setDoor(v as Door)}
      >
        {DOORS.map((d) => (
          <RadioGroup.Item key={d.value} value={d.value} className="cds-setup-door">
            <span className="cds-setup-door-title">{d.title}</span>
            <span className="cds-setup-door-desc">{d.desc}</span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>

      {door === 'zero' ? (
        <div className="cds-setup-form">
          <div className="cds-setup-cols">
            <div className="cds-setup-col">
              <h2 id="cds-setup-audio-label" className="cds-setup-heading">
                Escolha um áudio do projeto
              </h2>
              {audios === null ? (
                <p className="cds-setup-loading" role="status">
                  Carregando os áudios…
                </p>
              ) : (
                <RadioGroup.Root
                  className="cds-setup-audios"
                  aria-labelledby="cds-setup-audio-label"
                  value={audioId ?? ''}
                  onValueChange={setAudioId}
                >
                  {audios.map((a) => (
                    <RadioGroup.Item key={a.id} value={a.id} className="cds-setup-audio">
                      <span className="cds-setup-audio-name">{a.filename}</span>
                      {a.consent_present ? (
                        <span className="cds-setup-consent-ok">
                          Consentimento de coleta registrado
                        </span>
                      ) : (
                        <span className="cds-setup-consent-warn" data-role="warning">
                          Sem registro de consentimento de coleta.
                        </span>
                      )}
                      {audioId === a.id ? (
                        <span className="cds-setup-audio-ready">Áudio pronto</span>
                      ) : null}
                    </RadioGroup.Item>
                  ))}
                </RadioGroup.Root>
              )}
            </div>

            <div className="cds-setup-col">
              <h2 id="cds-setup-gran-label" className="cds-setup-heading">
                Tamanho da conta
              </h2>
              <RadioGroup.Root
                className="cds-setup-levels"
                aria-labelledby="cds-setup-gran-label"
                value={level}
                onValueChange={(v) => setLevel(v as GranularityLevel)}
              >
                {LEVELS.map((l) => (
                  <RadioGroup.Item
                    key={l.value}
                    value={l.value}
                    aria-label={l.title}
                    className="cds-setup-level"
                  >
                    <span className="cds-setup-level-title">{l.title}</span>
                    <span className="cds-setup-level-desc">{l.desc}</span>
                  </RadioGroup.Item>
                ))}
              </RadioGroup.Root>
              <p className="cds-setup-note" role="note">
                {SETUP_GRID_WARNING}
              </p>

              <label className="cds-setup-field">
                <span>Título / nome curto do colar</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="ex.: jesus-mienoi"
                />
              </label>

              <label className="cds-setup-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>Confirmo o consentimento de uso no pipeline do projeto.</span>
              </label>
            </div>
          </div>

          {error ? (
            <p className="cds-setup-error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            className="cds-setup-create"
            onClick={() => void create()}
            disabled={busy}
          >
            {busy ? 'Criando…' : 'Criar a sessão →'}
          </button>
        </div>
      ) : (
        <div className="cds-setup-import-door">
          <p className="cds-setup-import-hint">
            {door === 'entrega'
              ? 'Carregue uma entrega do projeto para confirmar de ouvido.'
              : 'Retome um retorno já salvo para continuar de onde parou.'}
          </p>
          <button type="button" className="cds-setup-create" onClick={() => navigate('/imports')}>
            Ir para os arquivos do pipeline →
          </button>
        </div>
      )}
    </section>
  );
}

export default Setup;
