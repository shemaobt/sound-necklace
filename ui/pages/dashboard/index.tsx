import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Popover from '@radix-ui/react-popover';

import type { AuthProvider } from '../../../adapters/api';
import type { SessionStore } from '../../../adapters/sessions';
import {
  manifestoFilename,
  relatorioFilename,
  retornoFilename,
  type SessionStep,
  type SessionSummary,
} from '../../../contracts';
import { Button, Skeleton } from '../../atoms';
import { ShemaIcon } from '../../tokens';
import {
  type ArtifactDownloads,
  type ArtifactKind,
} from '../../organisms/artifact-cards/artifact-cards';
import {
  SessionList,
  type SessionCardData,
  type SessionStatus,
} from '../../organisms/session-list/session-list';
import { navigate } from '../../app/router';
import { defaultAuth, defaultSessionStore } from './ports';
import './dashboard.css';

/**
 * Sessions dashboard (PRD v2 §7.2, protótipo Shemá v2 / ENG-278): a casa pós-login.
 * Lista TODAS as sessões da facilitadora em cartões — nome, slug, projeto, status,
 * última modificação e o relance de progresso pela capa do fio (contas acesas na
 * proporção do passo salvo); retoma direto no passo salvo (§7.3); baixa os três
 * artefatos de uma sessão concluída SEM abri-la (§10.5); e abre uma nova história. A
 * expiração de auth (§7.1) volta ao login sem tocar o estado em memória do app.
 *
 * Tem cabeçalho PRÓPRIO (o shell suprime o dele em `/dashboard`, como no `/login`):
 * marca + a usuária autenticada + sair. Reconciliações protótipo↔contrato (dado vence):
 * o protótipo mostra nome completo e e-mail ("Marcia Alencar / marcia@shema.org"), mas
 * `AuthUser` só tem `{id, username, roles}` — mostramos o `username` e a inicial, sem
 * inventar dados. O menu kebab do protótipo (renomear/duplicar/excluir) NÃO foi portado:
 * `SessionStore` não expõe essas operações e o §7.2 não as pede; os downloads, que o
 * protótipo punha nesse menu, seguem nos ArtifactCards (§7.2/§10.5); estender o
 * contrato para suportá-las é um follow-up contract-critical, fora do escopo `ui/`.
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
 * As seis estações do fio — a posição do passo salvo vira a proporção da capa. Os
 * rótulos leem do namespace `stations`, a MESMA fonte do fio de contas do shell
 * (ENG-279): duplicar a cópia fazia o stepper dizer "Ouvir" e o dashboard "Listen".
 */
const STEPS: readonly { key: SessionStep; labelKey: string }[] = [
  { key: 'listen', labelKey: 'stations.listen' },
  { key: 'cut', labelKey: 'stations.cut' },
  { key: 'triage', labelKey: 'stations.triage' },
  { key: 'phrases', labelKey: 'stations.phrases' },
  { key: 'conversation', labelKey: 'stations.conversation' },
  { key: 'save', labelKey: 'stations.save' },
];

const STATUS: Record<SessionSummary['status'], SessionStatus> = {
  in_progress: 'in-progress',
  completed: 'completed',
};

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * O organismo não faz aritmética de datas — a página entrega o texto pronto. O locale
 * acompanha o idioma da UI (ENG-279); o default PT-BR preserva o comportamento anterior.
 */
/** Id opaco (UUID) não é nome de projeto — cartão nunca mostra UUID (ENG-307). */
function looksLikeOpaqueId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function formatWhen(iso: string, locale = 'pt-BR'): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}

/** Relance do progresso (§7.2): quanto do fio já foi enfiado, e o passo por extenso. */
export function progressOf(step: SessionStep, t: Translate): { progress: number; label: string } {
  const i = Math.max(
    0,
    STEPS.findIndex((s) => s.key === step),
  );
  const station = t(STEPS[i]?.labelKey ?? STEPS[0]!.labelKey);
  return {
    progress: (i + 1) / STEPS.length,
    label: t('dashboard.progressLabel', { station, step: i + 1, total: STEPS.length }),
  };
}

const KINDS: readonly ArtifactKind[] = ['anchoring', 'manifest', 'report'];

/**
 * O menu de downloads do cartão concluído (ENG-305): os três artefatos atrás de
 * um "Baixar" no próprio cartão — os cards soltos abaixo da grade eram uma
 * segunda superfície competindo com as histórias. Os bytes vêm do MESMO
 * onDownload de sempre (§10.5, byte-idênticos aos guardados).
 */
function DownloadMenu({
  t,
  downloads,
  onKind,
}: {
  t: Translate;
  downloads: ArtifactDownloads;
  onKind: (kind: ArtifactKind) => void;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="cds-dashboard-dl-trigger">
          {t('dashboard.downloads')}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="cds-dashboard-dl-pop" sideOffset={6} align="end">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className="cds-dashboard-dl-item"
              data-downloaded={downloads[kind] || undefined}
              onClick={() => onKind(kind)}
            >
              <span aria-hidden="true">{downloads[kind] ? '✓' : '⤓'}</span>
              {t(`artifactCards.${kind}.title`)}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function toCard(s: SessionSummary, t: Translate, locale: string): SessionCardData {
  const { progress, label } = progressOf(s.progress.current_step, t);
  return {
    id: s.id,
    storyName: s.story_name,
    slug: s.story_slug,
    // §7.2 pede o projeto no cartão, mas a API real só serve o project_id — e um
    // UUID cru é ruído, não nome (ENG-307). Escondido até existir nome de projeto.
    project: looksLikeOpaqueId(s.project_id) ? '' : s.project_id,
    status: STATUS[s.status],
    lastModified: formatWhen(s.last_modified, locale),
    progress,
    progressLabel: label,
  };
}

function filenameFor(kind: ArtifactKind, slug: string): string {
  if (kind === 'anchoring') return retornoFilename(slug);
  if (kind === 'manifest') return manifestoFilename(slug);
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
  const [listError, setListError] = useState(false);
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    void store
      .list()
      .then((list) => {
        if (alive) setSessions(list);
      })
      .catch(() => {
        // fronteira de IO real (ENG-247): API fora do ar não pode ser um
        // "carregando…" eterno — lista vazia + aviso orientando recarregar
        if (alive) {
          setSessions([]);
          setListError(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [store]);

  // §7.1: a expiração volta ao login SEM limpar o estado do app (não tocamos o store).
  // `replace`: não se volta a uma rota cuja sessão de auth já caducou.
  useEffect(() => auth.onAuthExpired(() => navigate('/login', { replace: true })), [auth]);

  const onDownload = useCallback(
    async (s: SessionSummary, kind: ArtifactKind): Promise<void> => {
      const bytes = (await store.getArtifacts(s.id))[kind];
      saveBytes(filenameFor(kind, s.story_slug), bytes);
      setDownloaded((prev) => new Set(prev).add(`${s.id}:${kind}`));
    },
    [store, saveBytes],
  );

  const downloadsFor = useCallback(
    (id: string): ArtifactDownloads => ({
      anchoring: downloaded.has(`${id}:anchoring`),
      manifest: downloaded.has(`${id}:manifest`),
      report: downloaded.has(`${id}:report`),
    }),
    [downloaded],
  );

  const cards = useMemo(
    () =>
      (sessions ?? []).map((s) => ({
        ...toCard(s, t, locale),
        // concluída: os três documentos atrás do "Baixar" do próprio cartão (ENG-305)
        menu:
          s.status === 'completed' ? (
            <DownloadMenu
              t={t}
              downloads={downloadsFor(s.id)}
              onKind={(kind) => void onDownload(s, kind)}
            />
          ) : undefined,
      })),
    [sessions, t, locale, downloadsFor, onDownload],
  );
  const user = auth.currentUser();

  const onLogout = async (): Promise<void> => {
    await auth.logout();
    // `replace`: o Voltar não deve reabrir o dashboard de uma sessão já encerrada.
    navigate('/login', { replace: true });
  };

  const count = cards.length;
  const countLabel = count === 1 ? t('dashboard.countOne') : t('dashboard.countMany', { count });

  return (
    // <div>, não <section>: um <header> descendente de section/main não é exposto como
    // `banner` (HTML-AAM). Aqui ele é banner de verdade, e o corpo é o `main`.
    <div className="cds-dashboard">
      <header className="cds-dashboard-bar">
        <div className="cds-dashboard-brand">
          <ShemaIcon colorway="telha" size={30} />
          <h1 className="cds-dashboard-brand-title">{t('header.title')}</h1>
        </div>

        <div className="cds-dashboard-user">
          {user ? (
            <>
              <span className="cds-dashboard-username">{user.username}</span>
              <span className="cds-dashboard-avatar" aria-hidden="true">
                {user.username.slice(0, 1).toUpperCase()}
              </span>
            </>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => void onLogout()}>
            {t('dashboard.logout')}
          </Button>
        </div>
      </header>

      <main className="cds-dashboard-body">
        <div className="cds-dashboard-head">
          <div className="cds-dashboard-headings">
            <p className="cds-dashboard-eyebrow">{t('dashboard.eyebrow')}</p>
            <h2 className="cds-dashboard-title">{t('dashboard.title')}</h2>
          </div>
          {/* casa vazia não estampa um "0 histórias" frio — o cartão tracejado fala por si */}
          {count > 0 && <p className="cds-dashboard-count">{countLabel}</p>}
        </div>

        {listError && (
          <p className="cds-dashboard-loading" role="alert">
            {t('dashboard.listError')}
          </p>
        )}
        {sessions === null ? (
          // Esqueleto no formato da grade real (ENG-308): a casa nunca parece
          // travada enquanto a API responde. O anúncio acessível continua sendo
          // texto (`role=status`); os blocos são decorativos.
          <>
            <p className="cds-dashboard-vh" role="status">
              {t('dashboard.loading')}
            </p>
            <ul className="cds-session-list" aria-hidden="true">
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="cds-session-card cds-dashboard-card-skeleton">
                  {/* a MESMA casca do cartão real (ENG-332): capa + corpo herdam os
                      paddings/fundo do cds-session-card, então o esqueleto tem a
                      altura e o respiro de um cartão de verdade */}
                  <div className="cds-session-card-thumb">
                    <Skeleton className="cds-dashboard-skeleton-thumb" />
                  </div>
                  <div className="cds-session-card-body">
                    <Skeleton width="70%" height={18} />
                    <Skeleton width="45%" height={13} />
                    <div className="cds-session-card-meta">
                      <Skeleton width={92} height={26} />
                      <Skeleton width={64} height={12} />
                    </div>
                    <Skeleton width="100%" height={38} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <SessionList
              sessions={cards}
              onNew={() => navigate('/setup')}
              onResume={(id) => navigate(`/session/${id}`)}
              onOpen={(id) => navigate(`/session/${id}`)}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
