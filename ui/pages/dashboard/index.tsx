import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AuthProvider } from '../../../adapters/api';
import type { SessionStore } from '../../../adapters/sessions';
import {
  manifestoFilename,
  relatorioFilename,
  retornoFilename,
  type SessionStep,
  type SessionSummary,
} from '../../../contracts';
import {
  ArtifactCards,
  type ArtifactDownloads,
  type ArtifactKind,
} from '../../organisms/artifact-cards/artifact-cards';
import {
  SessionList,
  type SessionCardData,
  type SessionStationGlance,
  type SessionStatus,
} from '../../organisms/session-list/session-list';
import { navigate } from '../../app/router';
import { defaultAuth, defaultSessionStore } from './ports';
import './dashboard.css';

/**
 * Sessions dashboard (PRD v2 §7.2): a casa pós-login. Lista TODAS as sessões da
 * facilitadora com status, última modificação e o relance de progresso pelo fio de
 * contas; retoma uma sessão em progresso direto no passo salvo (§7.3, via o guard do
 * shell); baixa os três artefatos de uma sessão concluída SEM abri-la, reusando os
 * bytes opacos guardados (§10.5); e abre uma nova sessão. A expiração de auth (§7.1)
 * volta ao login sem tocar o estado em memória do app.
 *
 * Camada de wiring: as portas `auth`/`store` chegam por prop nos testes; em produção
 * resolvem os singletons fixture (ports.ts). O download real é a fronteira `saveBytes`.
 */
export interface DashboardProps {
  auth?: AuthProvider;
  store?: SessionStore;
  /** Fronteira de download; default grava um Blob no browser. */
  saveBytes?: (filename: string, bytes: string) => void;
}

/**
 * As seis estações leem do namespace `stations` — a MESMA fonte do fio de contas do
 * shell (ENG-279). Duplicar a cópia fazia o stepper dizer "Ouvir" e o dashboard "Listen".
 */
const STEPS: readonly { key: SessionStep; labelKey: string }[] = [
  { key: 'ouvir', labelKey: 'stations.ouvir' },
  { key: 'cortar', labelKey: 'stations.cortar' },
  { key: 'triagem', labelKey: 'stations.triagem' },
  { key: 'frases', labelKey: 'stations.frases' },
  { key: 'conversa', labelKey: 'stations.conversa' },
  { key: 'guardar', labelKey: 'stations.guardar' },
];

const STATUS: Record<SessionSummary['status'], SessionStatus> = {
  em_progresso: 'em-progresso',
  concluida: 'concluida',
};

type Translate = (key: string) => string;

/** Relance do progresso (§7.2): as seis estações, atual no passo salvo. */
function glance(step: SessionStep, t: Translate): SessionStationGlance[] {
  const ci = STEPS.findIndex((s) => s.key === step);
  return STEPS.map((s, i) => ({
    key: s.key,
    label: t(s.labelKey),
    state: i === ci ? 'current' : i < ci ? 'done' : 'future',
  }));
}

/**
 * O organismo não faz aritmética de datas — a página entrega o texto pronto. O locale
 * acompanha o idioma da UI (ENG-279); o default PT-BR preserva o comportamento anterior.
 */
export function formatWhen(iso: string, locale = 'pt-BR'): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}

function toCard(s: SessionSummary, t: Translate, locale: string): SessionCardData {
  return {
    id: s.id,
    storyName: s.story_name,
    slug: s.story_slug,
    project: s.project_id,
    status: STATUS[s.status],
    lastModified: formatWhen(s.last_modified, locale),
    stations: glance(s.progress.current_step, t),
  };
}

function filenameFor(kind: ArtifactKind, slug: string): string {
  if (kind === 'retorno') return retornoFilename(slug);
  if (kind === 'manifesto') return manifestoFilename(slug);
  return relatorioFilename(slug);
}

function domSaveBytes(filename: string, bytes: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function Dashboard({
  auth = defaultAuth(),
  store = defaultSessionStore(),
  saveBytes = domSaveBytes,
}: DashboardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'pt-BR';
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    void store.list().then((list) => {
      if (alive) setSessions(list);
    });
    return () => {
      alive = false;
    };
  }, [store]);

  // §7.1: a expiração volta ao login SEM limpar o estado do app (não tocamos o store).
  useEffect(() => auth.onAuthExpired(() => navigate('/login')), [auth]);

  const cards = useMemo(
    () => (sessions ?? []).map((s) => toCard(s, t, locale)),
    [sessions, t, locale],
  );
  const completed = useMemo(
    () => (sessions ?? []).filter((s) => s.status === 'concluida'),
    [sessions],
  );

  const onDownload = async (s: SessionSummary, kind: ArtifactKind): Promise<void> => {
    const bytes = (await store.getArtifacts(s.id))[kind];
    saveBytes(filenameFor(kind, s.story_slug), bytes);
    setDownloaded((prev) => new Set(prev).add(`${s.id}:${kind}`));
  };

  const downloadsFor = (id: string): ArtifactDownloads => ({
    retorno: downloaded.has(`${id}:retorno`),
    manifesto: downloaded.has(`${id}:manifesto`),
    relatorio: downloaded.has(`${id}:relatorio`),
  });

  return (
    <section className="cds-dashboard">
      <header className="cds-dashboard-head">
        <h1 className="cds-dashboard-title">{t('dashboard.title')}</h1>
        <button type="button" className="cds-dashboard-new" onClick={() => navigate('/setup')}>
          {t('dashboard.newSession')}
        </button>
      </header>

      {sessions === null ? (
        <p className="cds-dashboard-empty" role="status">
          {t('dashboard.loading')}
        </p>
      ) : sessions.length === 0 ? (
        <p className="cds-dashboard-empty">{t('dashboard.empty')}</p>
      ) : (
        <>
          <SessionList
            sessions={cards}
            onResume={(id) => navigate(`/session/${id}`)}
            onOpen={(id) => navigate(`/session/${id}`)}
          />

          {completed.length > 0 && (
            <div className="cds-dashboard-downloads">
              {completed.map((s) => (
                <section key={s.id} className="cds-dashboard-download-group">
                  <h2 className="cds-dashboard-download-title">{s.story_name}</h2>
                  <ArtifactCards
                    downloaded={downloadsFor(s.id)}
                    onDownload={(kind) => void onDownload(s, kind)}
                  />
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default Dashboard;
