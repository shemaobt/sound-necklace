import { useEffect, useMemo, useState } from 'react';

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

const STEPS: readonly { key: SessionStep; label: string }[] = [
  { key: 'ouvir', label: 'Ouvir' },
  { key: 'cortar', label: 'Cortar' },
  { key: 'triagem', label: 'Triagem' },
  { key: 'frases', label: 'Frases' },
  { key: 'conversa', label: 'Conversa' },
  { key: 'guardar', label: 'Guardar' },
];

const STATUS: Record<SessionSummary['status'], SessionStatus> = {
  em_progresso: 'em-progresso',
  concluida: 'concluida',
};

/** Relance do progresso (§7.2): as seis estações, atual no passo salvo. */
function glance(step: SessionStep): SessionStationGlance[] {
  const ci = STEPS.findIndex((s) => s.key === step);
  return STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    state: i === ci ? 'current' : i < ci ? 'done' : 'future',
  }));
}

/** O organismo não faz aritmética de datas — a página entrega o texto pronto. */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function toCard(s: SessionSummary): SessionCardData {
  return {
    id: s.id,
    storyName: s.story_name,
    slug: s.story_slug,
    project: s.project_id,
    status: STATUS[s.status],
    lastModified: formatWhen(s.last_modified),
    stations: glance(s.progress.current_step),
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

  const cards = useMemo(() => (sessions ?? []).map(toCard), [sessions]);
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
        <h1 className="cds-dashboard-title">Minhas sessões</h1>
        <button type="button" className="cds-dashboard-new" onClick={() => navigate('/setup')}>
          Nova sessão
        </button>
      </header>

      {sessions === null ? (
        <p className="cds-dashboard-empty" role="status">
          Carregando as sessões…
        </p>
      ) : sessions.length === 0 ? (
        <p className="cds-dashboard-empty">Você ainda não tem sessões.</p>
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
