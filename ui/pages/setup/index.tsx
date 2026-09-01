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
import { Chip, Skeleton } from '../../atoms';
import { PreparingSession } from '../../organisms';
import { ShemaIcon } from '../../tokens';
import { buildBeads, createSession, hashPCM } from '../../../domain';
import { navigate as routerNavigate } from '../../app/router';
import { goalStore, sessionStore, TODAY_GOALS, useGoalStore } from '../../state';
import { useRefreshOnFocus } from '../../app/use-refresh-on-focus';
import { GranularityLock } from './granularity-lock';
import {
  defaultAudioEngine,
  defaultBucket,
  defaultCanEdit,
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
 * A escolha do áudio usa Radix radio-group (foco em roleta + ARIA de graça); o visual
 * são os tokens Shemá. Carregar uma entrega ou retomar um retorno segue existindo como
 * a estação de arquivos do pipeline (ENG-248), não mais como porta desta tela.
 *
 * Camada de wiring: as portas chegam por prop nos testes; em produção resolvem os
 * singletons fixture (ports.ts). O `navigate` é injetável para o teste observar a
 * navegação assíncrona sem tocar o histórico.
 */

/* As três portas — começar do zero, confirmar uma entrega, retomar um retorno — saíram
   da tela (decisão do dono). A ENG-311 as quis visíveis e desabilitadas, para anunciar
   o caminho; na prática duas delas ocupavam o topo sem abrir nada, e um seletor com uma
   opção só não escolhe. As outras duas voltam quando existirem, pela porta que a
   estação /imports já é. */

/** Rótulo de cada nível. O Setup só EXIBE — quem escolhe é a tela de configuração. */
const LEVEL_TITLE_KEY: Record<GranularityLevel, string> = {
  small: 'setup.levelPequenaTitle',
  medium: 'setup.levelMediaTitle',
  large: 'setup.levelGrandeTitle',
};

/**
 * A granularidade do projeto, como o Setup a mostra (ENG-352): aqui ela se LÊ, não se
 * escolhe. Projeto ainda sem nível não chega a esta linha — a trava (ENG-363) o
 * interrompe antes, porque um default aqui elegeria o sistema de coordenadas do
 * corpus por omissão.
 */
function ProjectGranularity({ level }: { level: GranularityLevel }) {
  const { t } = useTranslation();
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
 * Até onde vamos hoje (ENG-653, protótipo v4 linhas 343-349): antes de começar, a
 * facilitadora diz o quanto os dois pretendem andar nesta sentada. Seis escolhas
 * fixas, nenhuma obrigatória, e escolher a que já está escolhida desfaz a escolha —
 * "sem meta" é um estado válido, e a barra do topo simplesmente não ganha marca.
 *
 * É um cartão de FACILITADORA, com o eyebrow dizendo isso: por isso os rótulos podem
 * contar cenas e conversas. A marca que sai daqui, essa sim, é vista pelos dois e não
 * carrega número nenhum (§9.2).
 *
 * A escolha NÃO entra no DTO da sessão — ver `ui/state/goal-store.ts` para o porquê.
 */
function TodayGoalCard() {
  const { t } = useTranslation();
  const goal = useGoalStore((s) => s.goal);
  return (
    <div className="cds-setup-goal">
      <div className="cds-setup-goal-head">
        <h2 className="cds-setup-heading" id="cds-setup-goal-label">
          {t('setup.goal.heading')}
        </h2>
        <p className="cds-setup-goal-eyebrow">{t('setup.goal.eyebrow')}</p>
      </div>
      <div className="cds-setup-goal-chips" role="group" aria-labelledby="cds-setup-goal-label">
        {TODAY_GOALS.map((option) => (
          <Chip
            key={option}
            label={t(`setup.goal.${option}`)}
            selected={goal === option}
            onClick={() => goalStore.getState().chooseGoal(option)}
          />
        ))}
      </div>
      <p className="cds-setup-goal-note" role="note">
        {t('setup.goal.note')}
      </p>
    </div>
  );
}

/**
 * O resumo da escolha (ENG-386, pacote de melhorias UI item 1): a confirmação de que
 * o áudio entrou passa a morar ao LADO do botão, não dentro da linha lá na lista.
 * Quem acabou de escolher olha para o mesmo canto onde está a ação que segue adiante.
 *
 * Recebe a listagem e o id em vez do áudio já resolvido para que a busca fique aqui:
 * a Setup já roça o teto de complexidade do lint.
 */
function SelectedAudio({
  audios,
  audioId,
}: {
  audios: BucketAudio[] | null;
  audioId: string | null;
}) {
  const { t } = useTranslation();
  const chosen = audios?.find((a) => a.id === audioId);
  if (!chosen) return null;
  return (
    <p className="cds-setup-picked">
      <span className="cds-setup-audio-ready">{t('setup.audioReady')}</span>
      <span className="cds-setup-picked-name">{chosen.filename}</span>
    </p>
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
  /** Quem pode decidir a granularidade: escolhe a variante da trava (ENG-363). */
  canEdit?: (projectId: string) => Promise<boolean>;
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
  canEdit = defaultCanEdit,
  projectId,
  navigate = routerNavigate,
}: SetupProps) {
  const { t } = useTranslation();
  const [audios, setAudios] = useState<BucketAudio[] | null>(null);
  const [audioId, setAudioId] = useState<string | null>(null);
  // A granularidade vem do PROJETO (ENG-352). `null` = ninguém decidiu ainda.
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const level = settings?.granularity_level ?? null;
  /**
   * Papel de quem está na tela, só consultado quando falta o nível (ENG-363).
   * `null` = ainda não se sabe: a trava espera, em vez de abrir como "peça a quem
   * administra" e trocar o texto debaixo dos olhos de quem administra.
   */
  const [canConfirm, setCanConfirm] = useState<boolean | null>(null);
  const [title, setTitle] = useState('');
  const [consent, setConsent] = useState(false);
  /**
   * A CHAVE do erro (e o detalhe que uma delas interpola), não o texto pronto: guardar o
   * traduzido obrigaria `t` a entrar nas dependências dos efeitos de leitura, e cada
   * troca de idioma refaria a listagem do bucket e a leitura da granularidade. De quebra,
   * o aviso passa a acompanhar a troca de idioma em vez de congelar no idioma em que
   * aconteceu.
   */
  const [error, setError] = useState<{ key: string; detail?: string } | null>(null);
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
          setError({ key: 'setup.bucketError' });
        }
      });
    return () => {
      alive = false;
    };
  }, [bucket]);

  // A granularidade do projeto (ENG-352). Falha de leitura não é fatal: a criação
  // barra sozinha logo abaixo (sem nível não há grade), então basta o aviso.
  //
  // `reread` re-dispara a leitura: o nível é decisão do PROJETO, e quem já estava
  // com esta tela aberta seguia vendo o valor velho depois de outra pessoa confirmar,
  // até recarregar a página. Voltar a olhar a aba relê (useRefreshOnFocus, abaixo).
  const [reread, setReread] = useState(0);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = projectId ?? (await defaultProjectId());
        const read = await projectSettings.get(id);
        if (!alive) return;
        setSettings(read);
        // o papel só importa quando falta o nível: é ele que escolhe a variante da
        // trava. Ler sempre seria uma chamada a mais em todo Setup, por nada.
        if (read.granularity_level === null) {
          const admin = await canEdit(id).catch(() => false);
          if (alive) setCanConfirm(admin);
        }
      } catch {
        if (alive) setError({ key: 'setup.granReadError' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectSettings, projectId, canEdit, reread]);

  useRefreshOnFocus(() => setReread((n) => n + 1));

  const create = async (): Promise<void> => {
    setError(null);
    const audio = audios?.find((a) => a.id === audioId) ?? null;
    const check = preflight({ audio, level, consent, settings, resolver });
    if ('errorKey' in check) {
      setError({ key: check.errorKey });
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
          pipelineConsent: consent,
        }),
      );
      await store.flush(summary.id);

      navigate(`/session/${summary.id}`);
    } catch (e) {
      setError(
        e instanceof AudioDecodeError
          ? { key: 'setup.decodeError', detail: e.message }
          : { key: 'setup.createFailed' },
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

      <div className="cds-setup-form">
        {/* Duas colunas da MESMA altura (ENG-386, pacote de melhorias UI item 1):
              à esquerda a entrega, que é a única coisa que pode encolher; à direita,
              estreita, o que se decide e — ancorada no pé — a ação. É o arranjo que
              tira o botão da dependência do tamanho da lista, e não o teto da janela:
              um teto em pixels só resolveria em janelas altas. */}
        <div className="cds-setup-cols">
          <div className="cds-setup-col cds-setup-col-list">
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
                {/* mesma janela da lista real: a espera não pode ter outra altura,
                      ou a tela dá um salto quando a listagem chega */}
                <div className="cds-setup-audios-scroll">
                  <div className="cds-setup-audios" aria-hidden="true">
                    {Array.from({ length: 4 }, (_, i) => (
                      <div key={i} className="cds-setup-audio cds-setup-audio-skeleton">
                        <Skeleton width="55%" height={15} />
                        <Skeleton width="35%" height={12} />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              /* A entrega rola AQUI DENTRO (ENG-386): numa entrega grande a lista
                   crescia até empurrar o "Criar a sessão" para fora da tela, e quem
                   acabara de escolher o áudio não via mais como seguir. A ação fica
                   fora desta janela — a distância até ela não depende mais de quantos
                   áudios a entrega tem. */
              <div className="cds-setup-audios-scroll">
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
                    </RadioGroup.Item>
                  ))}
                </RadioGroup.Root>
              </div>
            )}
          </div>

          <div className="cds-setup-col cds-setup-col-side">
            <h2 id="cds-setup-gran-label" className="cds-setup-heading">
              {t('setup.granHeading')}
            </h2>
            {level === null ? null : <ProjectGranularity level={level} />}

            <SelectedAudio audios={audios} audioId={audioId} />

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

            <TodayGoalCard />

            {/* O pé da coluna: a recusa explicada e o botão, juntos e sempre à
                  vista. O botão segue SEMPRE clicável e validando no clique (§9.5
                  guia, não pune) — a entrega desenha um `aria-disabled` aqui, e é a
                  única coisa dela que não seguimos. */}
            <div className="cds-setup-foot">
              {error ? (
                <p className="cds-setup-error" role="alert">
                  {t(error.key, { detail: error.detail })}
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
          </div>
        </div>
      </div>

      {/* Uma linha, não dois parágrafos (decisão do dono): a tela carregava informação
          demais. O que não encolhe é a divulgação em si — o PRD §4 conta "disclosed on
          the setup screen" entre as condições que tornam a voz sintética aceitável, e a
          policy do provedor de TTS pede o mesmo. Fora do caminho da decisão, no pé. */}
      <footer className="cds-setup-notes">
        <p role="note">{t('setup.disclosure')}</p>
      </footer>

      {/* Projeto sem tamanho de conta não cria sessão nenhuma (ENG-363): a trava
          fecha a tela até alguém decidir. Espera o papel para não abrir com o texto
          errado e trocá-lo em seguida. */}
      {level === null && canConfirm !== null ? (
        <GranularityLock
          canConfirm={canConfirm}
          onSetSize={() => navigate('/settings')}
          onBackToDashboard={() => navigate('/dashboard')}
        />
      ) : null}
    </section>
  );
}

export default Setup;
