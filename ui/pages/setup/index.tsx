import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as RadioGroup from '@radix-ui/react-radio-group';

import { AudioDecodeError, type AudioEngine } from '../../../adapters/audio';
import type { BucketSource } from '../../../adapters/bucket';
import type { GranularityResolver } from '../../../adapters/granularity';
import type { ProjectSettingsStore } from '../../../adapters/project-settings';
import type { SessionStore } from '../../../adapters/sessions';
import {
  type BucketAudio,
  type GranularityLevel,
  type ProjectSettings,
  toSessionDto,
} from '../../../contracts';
import { Skeleton } from '../../atoms';
import { PreparingSession } from '../../organisms';
import { ShemaIcon } from '../../tokens';
import { buildBeads, createSession, hashPCM } from '../../../domain';
import { navigate as routerNavigate } from '../../app/router';
import { sessionStore } from '../../state';
import {
  defaultAudioEngine,
  defaultBucket,
  defaultProjectId,
  defaultProjectSettings,
  defaultResolver,
  defaultSessionStore,
} from './ports';
import './setup.css';

/**
 * Estação Setup (PRD v2 §8.1, redesign §6.1): a criação de sessão. Superfície de
 * FACILITADORA (§7.2, texto mais denso permitido). Escolhe um áudio do bucket (§7.4,
 * com o indicador de consentimento de coleta §12/O6), nomeia a história (fallback =
 * nome do arquivo) e confirma o consentimento de uso no pipeline. Ao criar: decode →
 * grade + manifest_id client-side → SessionStore.create → persiste o estado inicial →
 * carrega a sessão viva → Escuta 1 (`mode='escuta'`).
 *
 * A granularidade NÃO se escolhe aqui desde a ENG-352: o nível é do PROJETO (definido
 * em ui/pages/project-settings) e esta tela o EXIBE. Sem campo numérico de segundos
 * (§6.1/§8.1) e sem default — projeto sem nível manda configurar.
 *
 * As três portas de entrada (§8.9) usam Radix radio-group (foco em roleta + ARIA de
 * graça); o visual são os tokens Shemá. As duas portas de importação levam à estação
 * de arquivos do pipeline (ENG-248).
 *
 * Camada de wiring: as portas chegam por prop nos testes; em produção resolvem os
 * singletons fixture (ports.ts). O `navigate` é injetável para o teste observar a
 * navegação assíncrona sem tocar o histórico.
 */

type Door = 'zero' | 'entrega' | 'anchoring';

/** As portas e os níveis guardam CHAVES i18n (a cópia vive no dicionário — ENG-279). */
/* entrega/retorno ainda não são funcionais: visíveis porém DESABILITADAS (decisão do
   dono, ENG-311) — presentes para anunciar o caminho, sem fingir que já andam. */
const DOORS: readonly { value: Door; titleKey: string; descKey: string; disabled?: boolean }[] = [
  { value: 'zero', titleKey: 'setup.doorZeroTitle', descKey: 'setup.doorZeroDesc' },
  {
    value: 'entrega',
    titleKey: 'setup.doorEntregaTitle',
    descKey: 'setup.doorEntregaDesc',
    disabled: true,
  },
  {
    value: 'anchoring',
    titleKey: 'setup.doorRetornoTitle',
    descKey: 'setup.doorRetornoDesc',
    disabled: true,
  },
];

/** Rótulo de cada nível. O Setup só EXIBE — quem escolhe é a tela de configuração. */
const LEVEL_TITLE_KEY: Record<GranularityLevel, string> = {
  small: 'setup.levelPequenaTitle',
  medium: 'setup.levelMediaTitle',
  large: 'setup.levelGrandeTitle',
};

/**
 * A granularidade do projeto, como o Setup a mostra (ENG-352): aqui ela se LÊ, não se
 * escolhe. Projeto ainda sem nível manda a facilitadora à tela de configuração em vez
 * de deixá-la decidir no meio de uma criação — um default aqui elegeria o sistema de
 * coordenadas do corpus por omissão.
 */
function ProjectGranularity({ level }: { level: GranularityLevel | null }) {
  const { t } = useTranslation();
  if (level === null) {
    return (
      <p className="cds-setup-note" data-role="warning" role="note">
        {t('setup.granUnset')} <a href="/project-settings">{t('setup.granConfigureLink')}</a>
      </p>
    );
  }
  return (
    <div className="cds-setup-gran" aria-labelledby="cds-setup-gran-label">
      <p className="cds-setup-gran-value">{t(LEVEL_TITLE_KEY[level])}</p>
      <p className="cds-setup-note" role="note">
        {t('setup.granFromProject')}
      </p>
    </div>
  );
}

/**
 * Mesma grade = mesmo bead em MILISSEGUNDOS. É a precisão que o artefato guarda — o
 * `manifest_id` mistura `round(beadSec × 1000)` (`domain/hash.ts`) —, então duas
 * durações que arredondam para o mesmo milissegundo produzem a mesma grade e o mesmo
 * hash. Comparar os floats crus reprovaria áudios idênticos por ruído de ponto
 * flutuante, e recusar uma criação legítima é tão ruim quanto aceitar uma divergente.
 */
function sameGrid(a: number, b: number): boolean {
  return Math.round(a * 1000) === Math.round(b * 1000);
}

interface PreflightInput {
  audio: BucketAudio | null;
  level: GranularityLevel | null;
  consent: boolean;
  settings: ProjectSettings | null;
  resolver: GranularityResolver;
}

type PreflightResult =
  { errorKey: string } | { audio: BucketAudio; level: GranularityLevel; beadSec: number };

/**
 * Tudo o que precisa ser verdade antes de tocar em IO — puro, e por isso testável
 * sem montar a tela. Devolve a CHAVE i18n da recusa (a cópia é da tela) ou os três
 * valores que a criação usa, já estreitados.
 *
 * As duas guardas de grade (ENG-352) são o motivo desta função existir: sem nível de
 * projeto não há grade a resolver, e criar com um default escolheria o sistema de
 * coordenadas do corpus por omissão; com nível, um áudio cujo acousteme resolva para
 * outra grade partiria o projeto em dois sistemas. Recusa e explica — normalizar para
 * a grade guardada quebraria a regra O8.
 */
function preflight({ audio, level, consent, settings, resolver }: PreflightInput): PreflightResult {
  if (!audio) return { errorKey: 'setup.noAudio' };
  if (!level) return { errorKey: 'setup.granUnset' };
  if (!consent) return { errorKey: 'setup.noConsent' };

  const { beadSec } = resolver.resolve(level, audio.acousteme ?? null);
  if (!(beadSec > 0)) return { errorKey: 'setup.noBeadSec' };
  if (settings?.bead_sec != null && !sameGrid(beadSec, settings.bead_sec)) {
    return { errorKey: 'setup.granMismatch' };
  }
  return { audio, level, beadSec };
}

export interface SetupProps {
  bucket?: BucketSource;
  resolver?: GranularityResolver;
  audioEngine?: AudioEngine;
  store?: SessionStore;
  /** A granularidade do projeto (§6.1/§8.1, ENG-352) — o Setup lê, não decide. */
  projectSettings?: ProjectSettingsStore;
  /** Projeto dono da sessão; sem prop, resolve por `defaultProjectId()` ao criar. */
  projectId?: string;
  navigate?: (to: string) => void;
}

export function Setup({
  bucket = defaultBucket(),
  resolver = defaultResolver(),
  audioEngine = defaultAudioEngine(),
  store = defaultSessionStore(),
  projectSettings = defaultProjectSettings(),
  projectId,
  navigate = routerNavigate,
}: SetupProps) {
  const { t } = useTranslation();
  const [audios, setAudios] = useState<BucketAudio[] | null>(null);
  const [door, setDoor] = useState<Door>('zero');
  const [audioId, setAudioId] = useState<string | null>(null);
  // A granularidade vem do PROJETO (ENG-352). `null` = ninguém decidiu ainda.
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const level = settings?.granularity_level ?? null;
  const [title, setTitle] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void bucket
      .list()
      .then((list) => {
        if (alive) setAudios(list);
      })
      .catch(() => {
        // fronteira de IO real (ENG-247): a listagem pode falhar — mostra o aviso
        // em vez de deixar a promise escapar e a tela presa em "carregando"
        if (alive) {
          setAudios([]);
          setError(t('setup.bucketError'));
        }
      });
    return () => {
      alive = false;
    };
  }, [bucket, t]);

  // A granularidade do projeto (ENG-352). Falha de leitura não é fatal: a criação
  // barra sozinha logo abaixo (sem nível não há grade), então basta o aviso.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = projectId ?? (await defaultProjectId());
        const read = await projectSettings.get(id);
        if (alive) setSettings(read);
      } catch {
        if (alive) setError(t('setup.granReadError'));
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectSettings, projectId, t]);

  const create = async (): Promise<void> => {
    setError(null);
    const audio = audios?.find((a) => a.id === audioId) ?? null;
    const check = preflight({ audio, level, consent, settings, resolver });
    if ('errorKey' in check) {
      setError(t(check.errorKey));
      return;
    }
    const { audio: chosen, level: projectLevel, beadSec } = check;
    // Fronteira da AÇÃO do usuário: uma criação orquestra várias portas de IO
    // (fetch/decode/create/flush). O try/catch/finally aqui garante que `busy`
    // SEMPRE reabilita o botão; a falha esperada e tipada do decode vira a cópia
    // §8.1, e qualquer outra falha de sistema vira a orientação genérica (nenhuma
    // trava silenciosa). Grade/hash/createSession são puros — não lançam aqui.
    setBusy(true);
    try {
      const bytes = await bucket.fetchBytes(chosen.id);
      const decoded = await audioEngine.decode(bytes);

      const beads = buildBeads(decoded.duration, beadSec);
      const manifestId = hashPCM(decoded.pcm, beadSec);
      const name = title.trim() || chosen.filename.replace(/\.[^.]+$/, '') || 'colar';

      const ownerProjectId = projectId ?? (await defaultProjectId());
      const summary = await store.create({
        projectId: ownerProjectId,
        storyName: name,
        storySlug: name,
        audioId: chosen.id,
        granularityLevel: projectLevel,
        beadSec,
        manifestId,
        pipelineConsent: consent,
      });
      // O projeto passou a ter uma grade: no modo real a API já carimbou na mesma
      // transação e isto é no-op; na fixture é o que congela o nível daqui em diante.
      projectSettings.noteSessionCreated(ownerProjectId, projectLevel, beadSec);

      const state = createSession({
        durationSec: decoded.duration,
        beadSec,
        beads,
        manifestId,
        audioFilename: chosen.filename,
        slug: name,
      });
      sessionStore.getState().load(state);
      store.autosave(
        summary.id,
        toSessionDto(state, {
          granularityLevel: projectLevel,
          bucketAudioId: chosen.id,
          voice: [],
          pipelineConsent: consent,
        }),
      );
      await store.flush(summary.id);

      navigate(`/session/${summary.id}`);
    } catch (e) {
      setError(
        e instanceof AudioDecodeError
          ? t('setup.decodeError', { detail: e instanceof Error ? e.message : String(e) })
          : t('setup.createFailed'),
      );
    } finally {
      setBusy(false);
    }
  };

  // A espera pós-clique vira palco (ENG-334): enquanto fetch+decode+create voam,
  // o formulário sai e o fio de contas em onda assume — o mesmo componente que a
  // rota da sessão usa na retomada, então criar e retomar falam a mesma língua.
  // a tela de espera é full-bleed oliva (com a própria marca d'água): sem o cartão
  // creme do setup em volta, ela fala a MESMA língua da retomada de sessão.
  if (busy) {
    return <PreparingSession />;
  }

  return (
    <section className="cds-setup">
      <span className="cds-setup-watermark" aria-hidden="true">
        <ShemaIcon colorway="telha" size={340} />
      </span>
      <header className="cds-setup-header">
        <p className="cds-setup-eyebrow">{t('setup.eyebrow')}</p>
        <h1 className="cds-setup-title">{t('setup.title')}</h1>
      </header>

      <RadioGroup.Root
        className="cds-setup-doors"
        aria-label={t('setup.doorsAria')}
        value={door}
        onValueChange={(v) => setDoor(v as Door)}
      >
        {DOORS.map((d) => (
          <RadioGroup.Item
            key={d.value}
            value={d.value}
            className="cds-setup-door"
            disabled={d.disabled ?? false}
          >
            <span className="cds-setup-door-title">{t(d.titleKey)}</span>
            <span className="cds-setup-door-desc">{t(d.descKey)}</span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>

      {door === 'zero' ? (
        <div className="cds-setup-form">
          <div className="cds-setup-cols">
            <div className="cds-setup-col">
              <h2 id="cds-setup-audio-label" className="cds-setup-heading">
                {t('setup.audioHeading')}
              </h2>
              {audios === null ? (
                // esqueleto no formato da lista real (ENG-311): a tela nunca parece
                // travada; o anúncio acessível segue por texto (role=status)
                <>
                  <p className="cds-setup-vh" role="status">
                    {t('setup.loadingAudios')}
                  </p>
                  <div className="cds-setup-audios" aria-hidden="true">
                    {Array.from({ length: 4 }, (_, i) => (
                      <div key={i} className="cds-setup-audio cds-setup-audio-skeleton">
                        <Skeleton width="55%" height={15} />
                        <Skeleton width="35%" height={12} />
                      </div>
                    ))}
                  </div>
                </>
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
                      {/* badge curto (ENG-310): a frase completa do indicador §12/O6
                          continua no title/aria — repetida por cartão ela virava parede */}
                      {a.consent_present ? (
                        <span
                          className="cds-setup-consent-ok"
                          title={t('setup.consentOk')}
                          aria-label={t('setup.consentOk')}
                        >
                          {t('setup.consentOkShort')}
                        </span>
                      ) : (
                        <span
                          className="cds-setup-consent-warn"
                          data-role="warning"
                          title={t('setup.consentWarn')}
                          aria-label={t('setup.consentWarn')}
                        >
                          {t('setup.consentWarnShort')}
                        </span>
                      )}
                      {audioId === a.id ? (
                        <span className="cds-setup-audio-ready">{t('setup.audioReady')}</span>
                      ) : null}
                    </RadioGroup.Item>
                  ))}
                </RadioGroup.Root>
              )}
            </div>

            <div className="cds-setup-col">
              <h2 id="cds-setup-gran-label" className="cds-setup-heading">
                {t('setup.granHeading')}
              </h2>
              <ProjectGranularity level={level} />

              <label className="cds-setup-field">
                <span>{t('setup.titleField')}</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('setup.titlePlaceholder')}
                />
              </label>

              <label className="cds-setup-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>{t('setup.consentCheck')}</span>
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
            {busy ? t('setup.creating') : t('setup.create')}
          </button>
        </div>
      ) : (
        <div className="cds-setup-import-door">
          <p className="cds-setup-import-hint">
            {door === 'entrega' ? t('setup.importEntregaHint') : t('setup.importRetornoHint')}
          </p>
          <button type="button" className="cds-setup-create" onClick={() => navigate('/imports')}>
            {t('setup.goToImports')}
          </button>
        </div>
      )}

      {/* rodapé quieto (ENG-309): confiança + divulgação de IA (§12, obrigatória)
          juntas, fora do caminho da decisão — antes eram dois avisos grandes no topo */}
      <footer className="cds-setup-notes">
        <p role="note">{t('setup.trustLine')}</p>
        <p role="note">{t('setup.aiVoiceNotice')}</p>
      </footer>
    </section>
  );
}

export default Setup;
