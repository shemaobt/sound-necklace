import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as RadioGroup from '@radix-ui/react-radio-group';

import {
  GranularityLockedError,
  type ProjectSettingsStore,
} from '../../../adapters/project-settings';
import type { GranularityLevel, ProjectSettings } from '../../../contracts';
import { ShemaIcon } from '../../tokens';
import { navigate as routerNavigate } from '../../app/router';
import { defaultProjectId, defaultProjectSettings } from './ports';
import './project-settings.css';

/**
 * Configuração do projeto (ENG-352): onde o tamanho da conta é decidido, uma vez.
 *
 * Superfície de FACILITADORA/ADMIN (§7.2) — texto mais denso é permitido, porque a
 * decisão é consequente: `beadSec` define a grade e entra no `manifest_id`, então é o
 * sistema de coordenadas em que o pipeline e o dado de treino são construídos. Escolhê-lo
 * por sessão, como o Setup fazia, deixava dois áudios do mesmo projeto caírem em grades
 * incompatíveis.
 *
 * Duas leituras da mesma tela: enquanto o projeto não cortou nada, ela oferece os três
 * níveis; depois, explica por que não oferece mais. Recortar um projeto numa nova
 * granularidade re-deriva todo `manifest_id` já exportado — é migração, não configuração.
 */

const LEVELS: readonly { value: GranularityLevel; titleKey: string; descKey: string }[] = [
  { value: 'small', titleKey: 'setup.levelPequenaTitle', descKey: 'setup.levelPequenaDesc' },
  { value: 'medium', titleKey: 'setup.levelMediaTitle', descKey: 'setup.levelMediaDesc' },
  { value: 'large', titleKey: 'setup.levelGrandeTitle', descKey: 'setup.levelGrandeDesc' },
];

export interface ProjectSettingsPageProps {
  store?: ProjectSettingsStore;
  projectId?: string;
  navigate?: (to: string) => void;
}

export function ProjectSettingsPage({
  store = defaultProjectSettings(),
  projectId,
  navigate = routerNavigate,
}: ProjectSettingsPageProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [chosen, setChosen] = useState<GranularityLevel | null>(null);
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'saved'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = projectId ?? (await defaultProjectId());
        const read = await store.get(id);
        if (!alive) return;
        setSettings(read);
        setChosen(read.granularity_level);
        setStatus('idle');
      } catch {
        if (!alive) return;
        setError(t('projectSettings.readError'));
        setStatus('idle');
      }
    })();
    return () => {
      alive = false;
    };
  }, [store, projectId, t]);

  const save = async (): Promise<void> => {
    if (!chosen) return;
    setError(null);
    setStatus('saving');
    // Fronteira da AÇÃO: o PUT tem três desfechos que a tela trata diferente — sucesso,
    // congelado (explica) e 403 (não é admin). Qualquer outra falha vira a genérica.
    try {
      const id = projectId ?? (await defaultProjectId());
      setSettings(await store.setLevel(id, chosen));
      setStatus('saved');
    } catch (e) {
      setStatus('idle');
      if (e instanceof GranularityLockedError) {
        setSettings((s) => (s ? { ...s, locked: true } : s));
        setError(t('projectSettings.lockedBody'));
        return;
      }
      setError(
        e instanceof Error && e.message.includes('403')
          ? t('projectSettings.forbidden')
          : t('projectSettings.saveError'),
      );
    }
  };

  const locked = settings?.locked ?? false;

  return (
    <section className="cds-project-settings">
      <span className="cds-project-settings-watermark" aria-hidden="true">
        <ShemaIcon colorway="telha" size={280} />
      </span>
      <header className="cds-project-settings-header">
        <p className="cds-project-settings-eyebrow">{t('projectSettings.eyebrow')}</p>
        <h1 className="cds-project-settings-title">{t('projectSettings.title')}</h1>
        <p className="cds-project-settings-lead">{t('projectSettings.lead')}</p>
      </header>

      {status === 'loading' ? (
        <p role="status">{t('projectSettings.loading')}</p>
      ) : locked ? (
        <div className="cds-project-settings-locked">
          <h2 className="cds-project-settings-heading">{t('projectSettings.lockedTitle')}</h2>
          <p className="cds-project-settings-value">
            {settings?.granularity_level
              ? t(LEVELS.find((l) => l.value === settings.granularity_level)!.titleKey)
              : t('projectSettings.unset')}
          </p>
          <p className="cds-project-settings-note" role="note">
            {t('projectSettings.lockedBody')}
          </p>
        </div>
      ) : (
        <>
          <RadioGroup.Root
            className="cds-project-settings-levels"
            aria-label={t('projectSettings.levelsAria')}
            value={chosen ?? ''}
            onValueChange={(v) => setChosen(v as GranularityLevel)}
          >
            {LEVELS.map((l) => (
              <RadioGroup.Item
                key={l.value}
                value={l.value}
                aria-label={t(l.titleKey)}
                className="cds-project-settings-level"
              >
                <span className="cds-project-settings-level-title">{t(l.titleKey)}</span>
                <span className="cds-project-settings-level-desc">{t(l.descKey)}</span>
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>

          <button
            type="button"
            className="cds-project-settings-save"
            onClick={() => void save()}
            disabled={!chosen || status === 'saving'}
          >
            {status === 'saving' ? t('projectSettings.saving') : t('projectSettings.save')}
          </button>
          {status === 'saved' ? (
            <p className="cds-project-settings-ok" role="status">
              {t('projectSettings.saved')}
            </p>
          ) : null}
        </>
      )}

      {error ? (
        <p className="cds-project-settings-error" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="cds-project-settings-back"
        onClick={() => navigate('/dashboard')}
      >
        {t('projectSettings.back')}
      </button>
    </section>
  );
}

export default ProjectSettingsPage;
