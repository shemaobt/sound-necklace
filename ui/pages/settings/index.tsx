import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as RadioGroup from '@radix-ui/react-radio-group';

import {
  ForbiddenError,
  GranularityLockedError,
  type ProjectSettingsStore,
} from '../../../adapters/project-settings';
import type { GranularityLevel, ProjectSettings } from '../../../contracts';
import { Pearl } from '../../atoms';
import { setLang, type Lang } from '../../i18n';
import { ShemaIcon, scenePalette } from '../../tokens';
import { useRefreshOnFocus } from '../../app/use-refresh-on-focus';
import { defaultCanEdit, defaultProjectId, defaultProjectSettings } from './ports';
import './settings.css';

/**
 * Configurações (ENG-352) — o que vale para o projeto inteiro, fora da criação das
 * histórias. Superfície de FACILITADORA/ADMIN (§7.2): texto mais denso é permitido, e
 * aqui é necessário, porque uma das duas decisões é irreversível.
 *
 * Dois cartões com pesos deliberadamente diferentes (referência do dono, 2026-07-24): o
 * idioma é preferência reversível de cada pessoa e vive num cartão claro comum; a
 * granularidade é a decisão irreversível do projeto e ganha o cartão cerimonial escuro,
 * com o cordão de contas, o cadeado no botão e a frase que diz que não muda depois.
 *
 * Confirmar É a trava (ENG-361): depois dela o cartão troca de forma — mostra o tamanho
 * escolhido e explica, em vez de oferecer um controle desabilitado.
 */

const LEVELS: readonly GranularityLevel[] = ['small', 'medium', 'large'];

/** O cordão da prévia é telha, a mesma cor de cena que o colar usa (§4.2). */
const CORD_TINT = scenePalette[0]!;

/** O cordão da prévia: conta menor cabe em mais contas — é o que o nível significa. */
const PREVIEW: Record<GranularityLevel, { size: number; count: number }> = {
  small: { size: 13, count: 30 },
  medium: { size: 18, count: 21 },
  large: { size: 27, count: 14 },
};

/**
 * Os idiomas que a ferramenta REALMENTE fala. A referência desenha um terceiro cartão
 * (Español), mas traduzir o app inteiro é trabalho de tradutor humano, não de layout —
 * fica como issue própria. Um cartão que não traduz nada seria pior que a ausência dele.
 */
const LANGS: readonly { value: Lang; nameKey: string; regionKey: string }[] = [
  { value: 'pt', nameKey: 'settings.langPtName', regionKey: 'settings.langPtRegion' },
  { value: 'en', nameKey: 'settings.langEnName', regionKey: 'settings.langEnRegion' },
];

export interface SettingsProps {
  store?: ProjectSettingsStore;
  projectId?: string;
  /** Se esta pessoa pode confirmar a granularidade (papel `project_admin`). */
  canEdit?: boolean;
}

export function Settings({ store = defaultProjectSettings(), projectId, canEdit }: SettingsProps) {
  const { t } = useTranslation();

  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [chosen, setChosen] = useState<GranularityLevel>('medium');
  const [admin, setAdmin] = useState(canEdit ?? false);
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving'>('loading');
  /**
   * A CHAVE do erro, não o texto: guardar o traduzido obrigaria `t` a entrar nas
   * dependências do efeito de leitura, e cada troca de idioma refaria as três chamadas
   * de rede que montam esta tela. De quebra, um erro na tela passa a acompanhar a troca
   * de idioma em vez de ficar congelado no idioma em que aconteceu.
   */
  const [error, setError] = useState<string | null>(null);

  // `reread` re-dispara a leitura. O nível é decisão do PROJETO e IRREVERSÍVEL: quem
  // ficou com esta tela aberta seguia vendo "ainda não escolhido" depois de outra
  // pessoa confirmar, e podia tentar escolher de novo só para receber o 409. Voltar a
  // olhar a aba relê.
  const [reread, setReread] = useState(0);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = projectId ?? (await defaultProjectId());
        const [read, may] = await Promise.all([
          store.get(id),
          canEdit === undefined ? defaultCanEdit(id) : Promise.resolve(canEdit),
        ]);
        if (!alive) return;
        setSettings(read);
        if (read.granularity_level) setChosen(read.granularity_level);
        setAdmin(may);
        setStatus('idle');
      } catch {
        if (!alive) return;
        setError('settings.readError');
        setStatus('idle');
      }
    })();
    return () => {
      alive = false;
    };
  }, [store, projectId, canEdit, reread]);

  useRefreshOnFocus(() => setReread((n) => n + 1));

  const confirm = async (): Promise<void> => {
    setError(null);
    setStatus('saving');
    // Fronteira da AÇÃO: o PUT tem três desfechos que a tela trata diferente — sucesso,
    // já confirmado (mostra o estado real) e 403. Outra falha vira a orientação genérica.
    try {
      const id = projectId ?? (await defaultProjectId());
      setSettings(await store.setLevel(id, chosen));
      setStatus('idle');
    } catch (e) {
      setStatus('idle');
      if (e instanceof GranularityLockedError) {
        // Relê antes de dizer "confirmado": o nível que vale é o de quem VENCEU a
        // corrida, e o que esta tela tem em mãos é a escolha que acabou de ser recusada.
        // Mostrá-la sob a frase "não muda mais" mandaria a pessoa embora convencida de
        // uma grade que o projeto não tem. Se a releitura também falhar, sobra a trava
        // local — dizer que travou é verdade mesmo sem saber em quê.
        try {
          setSettings(await store.get(projectId ?? (await defaultProjectId())));
        } catch {
          setSettings((s) => (s ? { ...s, locked: true } : s));
        }
        setError('settings.granAlreadyConfirmed');
        return;
      }
      setError(e instanceof ForbiddenError ? 'settings.granForbidden' : 'settings.granSaveError');
    }
  };

  const confirmed = settings?.locked ?? false;
  /**
   * Confirmado, o valor é o do SERVIDOR — e `null` quando nem a releitura o trouxe.
   * Cair de volta em `chosen` aqui apresentaria a escolha desta pessoa como a decisão
   * do projeto; melhor não afirmar tamanho nenhum e deixar o alerta explicar.
   */
  const shown: GranularityLevel | null = confirmed ? (settings?.granularity_level ?? null) : chosen;

  return (
    <section className="cds-settings">
      <header className="cds-settings-header">
        <p className="cds-settings-eyebrow">{t('settings.eyebrow')}</p>
        <h1 className="cds-settings-title">{t('settings.title')}</h1>
        <p className="cds-settings-lead">{t('settings.lead')}</p>
      </header>

      <LanguageCard />

      <GranularityCard
        confirmed={confirmed}
        shown={shown}
        admin={admin}
        status={status}
        error={error}
        onChoose={setChosen}
        onConfirm={() => void confirm()}
      />
    </section>
  );
}

/** O idioma da ferramenta: preferência de cada pessoa, reversível, guardada localmente. */
function LanguageCard() {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language.startsWith('en') ? 'en' : 'pt';

  return (
    <section className="cds-settings-card" aria-labelledby="cds-settings-lang">
      <h2 id="cds-settings-lang" className="cds-settings-card-title">
        {t('settings.langHeading')}
      </h2>
      <p className="cds-settings-card-lead">{t('settings.langLead')}</p>
      <RadioGroup.Root
        className="cds-settings-langs"
        aria-labelledby="cds-settings-lang"
        value={lang}
        onValueChange={(v) => setLang(v as Lang)}
      >
        {LANGS.map((l) => (
          <RadioGroup.Item
            key={l.value}
            value={l.value}
            aria-label={t(l.nameKey)}
            className="cds-settings-lang"
          >
            <span className="cds-settings-lang-name">{t(l.nameKey)}</span>
            <span className="cds-settings-lang-region">{t(l.regionKey)}</span>
            <RadioGroup.Indicator className="cds-settings-lang-check" aria-hidden="true" />
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </section>
  );
}

/**
 * O cartão cerimonial da granularidade. Duas formas, não uma com controle desabilitado:
 * enquanto dá para escolher ele oferece os três tamanhos e o botão do cadeado; depois de
 * confirmado ele mostra o tamanho e explica por que não oferece mais.
 */
function GranularityCard({
  confirmed,
  shown,
  admin,
  status,
  error,
  onChoose,
  onConfirm,
}: {
  confirmed: boolean;
  shown: GranularityLevel | null;
  admin: boolean;
  status: 'loading' | 'idle' | 'saving';
  /** Chave do dicionário, traduzida aqui — ver o estado `error` em `Settings`. */
  error: string | null;
  onChoose: (level: GranularityLevel) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  /** O cordão é decoração (`aria-hidden`), então um tamanho de desenho não afirma nada. */
  const preview = PREVIEW[shown ?? 'medium'];

  return (
    <section className="cds-settings-gran" aria-labelledby="cds-settings-gran-title">
      <span className="cds-settings-gran-watermark" aria-hidden="true">
        <ShemaIcon colorway="telha" size={260} />
      </span>
      <p className="cds-settings-gran-eyebrow">{t('settings.granEyebrow')}</p>
      <h2 id="cds-settings-gran-title" className="cds-settings-gran-title">
        {t(confirmed ? 'settings.granTitleConfirmed' : 'settings.granTitle')}
      </h2>
      <p className="cds-settings-gran-lead">
        {t(confirmed ? 'settings.granLeadConfirmed' : 'settings.granLead')}
      </p>

      {status === 'loading' ? (
        <p role="status">{t('settings.loading')}</p>
      ) : (
        <>
          <div className="cds-settings-cord" aria-hidden="true">
            {Array.from({ length: preview.count }, (_, i) => (
              <Pearl key={i} state="lit" tint={CORD_TINT} size={preview.size} />
            ))}
          </div>

          {confirmed ? (
            shown ? (
              <p className="cds-settings-gran-value">{t(`settings.level.${shown}`)}</p>
            ) : null
          ) : (
            <RadioGroup.Root
              className="cds-settings-levels"
              aria-label={t('settings.granEyebrow')}
              value={shown ?? undefined}
              onValueChange={(v) => onChoose(v as GranularityLevel)}
              disabled={!admin}
            >
              {LEVELS.map((l) => (
                <RadioGroup.Item key={l} value={l} className="cds-settings-level">
                  {t(`settings.level.${l}`)}
                </RadioGroup.Item>
              ))}
            </RadioGroup.Root>
          )}

          {shown ? (
            <p className="cds-settings-gran-note">{t(`settings.levelDesc.${shown}`)}</p>
          ) : null}

          <ConfirmAction
            confirmed={confirmed}
            admin={admin}
            status={status}
            onConfirm={onConfirm}
          />
        </>
      )}

      {error ? (
        <p className="cds-settings-error" role="alert">
          {t(error)}
        </p>
      ) : null}
    </section>
  );
}

/** Confirmado não oferece nada; quem não administra é mandado falar com quem administra. */
function ConfirmAction({
  confirmed,
  admin,
  status,
  onConfirm,
}: {
  confirmed: boolean;
  admin: boolean;
  status: 'loading' | 'idle' | 'saving';
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  if (confirmed) return null;
  if (!admin) {
    return (
      <p className="cds-settings-gran-note" data-role="warning">
        {t('settings.granAskAdmin')}
      </p>
    );
  }
  return (
    <button
      type="button"
      className="cds-settings-confirm"
      onClick={onConfirm}
      disabled={status === 'saving'}
    >
      <span aria-hidden="true">🔒</span>{' '}
      {t(status === 'saving' ? 'settings.granConfirming' : 'settings.granConfirm')}
    </button>
  );
}

export default Settings;
