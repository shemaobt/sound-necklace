import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';

import type { AuthProvider } from '../../../adapters/api';
import { LockLostError, type SessionStore } from '../../../adapters/sessions';
import {
  manifestoFilename,
  relatorioFilename,
  retornoFilename,
  type SessionStep,
  type SessionSummary,
} from '../../../contracts';
import { Button, Skeleton } from '../../atoms';
import { ShemaIcon } from '../../tokens';
import { type ArtifactKind } from '../../organisms/artifact-cards/artifact-cards';
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
 * artefatos de uma sessão concluída SEM abri-la (§10.5); apaga uma história em
 * definitivo, depois de perguntar; e abre uma nova. A expiração de auth (§7.1) volta
 * ao login sem tocar o estado em memória do app.
 *
 * Tem cabeçalho PRÓPRIO (o shell suprime o dele em `/dashboard`, como no `/login`):
 * marca + a usuária autenticada + sair. Reconciliações protótipo↔contrato (dado vence):
 * o protótipo mostra nome completo e e-mail ("Marcia Alencar / marcia@shema.org"), mas
 * `AuthUser` só tem `{id, username, roles}` — mostramos o `username` e a inicial, sem
 * inventar dados. Do kebab do protótipo (renomear/duplicar/excluir) existe hoje o
 * excluir (`store.remove`, ENG-281) ao lado dos downloads (ENG-305); duplicar não
 * existe na porta nem no §7.2, e renomear é outra fatia, com o diálogo dela.
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

/** Engrenagem das Configurações (ENG-375) — só a casa a oferece. */
function GearGlyph() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const KINDS: readonly ArtifactKind[] = ['anchoring', 'manifest', 'report'];

/**
 * O menu de ações do cartão (ENG-305 → ENG-281). Nasceu só com os downloads da
 * concluída — os cards soltos abaixo da grade eram uma segunda superfície
 * competindo com as histórias — e agora carrega também o apagar, que vale a
 * QUALQUER momento: por isso o menu está em todo cartão, e não só nos prontos.
 * Os bytes do download vêm do MESMO onDownload de sempre (§10.5, byte-idênticos
 * aos guardados); os três documentos saem de uma escolha só.
 */
function ActionsMenu({
  t,
  story,
  canDownload,
  downloaded,
  onDownload,
  onDelete,
}: {
  t: Translate;
  story: string;
  canDownload: boolean;
  downloaded: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    // sem `open` controlado: o apagar abre OUTRA camada, e o próprio Radix fecha o
    // menu quando o diálogo leva o foco embora (um teste guarda que ele não fica
    // preso atrás do véu)
    <Popover.Root>
      <Popover.Trigger asChild>
        {/* ícone discreto (ENG-333): o nome vive no aria-label, e nomeia a história
            — dois cartões na grade dão dois gatilhos, e "Ações" sozinho não diz
            em qual deles se está */}
        <button
          type="button"
          className="cds-dashboard-dl-trigger"
          aria-label={t('dashboard.actions', { story })}
          title={t('dashboard.actions', { story })}
        >
          <span aria-hidden="true">⋮</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="cds-dashboard-dl-pop" sideOffset={6} align="end">
          {/* os documentos só existem depois de guardar (§8.8) */}
          {canDownload && (
            <button
              type="button"
              className="cds-dashboard-dl-item"
              data-downloaded={downloaded || undefined}
              onClick={onDownload}
            >
              <span aria-hidden="true">{downloaded ? '✓' : '⤓'}</span>
              {t('dashboard.downloads')}
            </button>
          )}
          <button
            type="button"
            className="cds-dashboard-dl-item"
            data-danger="true"
            onClick={onDelete}
          >
            <span aria-hidden="true">✕</span>
            {t('dashboard.deleteSession')}
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * A pergunta antes de apagar (ENG-281). Apagar é definitivo e leva as gravações de
 * voz junto, então a pergunta NOMEIA a história: sem o nome, a facilitadora não tem
 * como perceber que abriu o menu do cartão errado. O foco inicial vai para o manter
 * — um Enter distraído nunca deve ser o que destrói (§9.4: orientar, nunca punir).
 */
function DeleteConfirm({
  t,
  story,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  t: Translate;
  story: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const keepRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog.Root open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <Dialog.Portal>
        <Dialog.Overlay className="cds-dashboard-confirm-overlay" />
        <Dialog.Content
          className="cds-dashboard-confirm"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            keepRef.current?.querySelector('button')?.focus();
          }}
        >
          <Dialog.Title className="cds-dashboard-confirm-title">
            {t('dashboard.deleteConfirm.title', { story })}
          </Dialog.Title>
          <Dialog.Description className="cds-dashboard-confirm-body">
            {t('dashboard.deleteConfirm.body')}
          </Dialog.Description>
          {error && (
            <p className="cds-dashboard-confirm-alert" role="alert">
              {error}
            </p>
          )}
          <div className="cds-dashboard-confirm-actions">
            <div ref={keepRef} style={{ display: 'contents' }}>
              <Button size="sm" onClick={onCancel}>
                {t('dashboard.deleteConfirm.cancel')}
              </Button>
            </div>
            {/* desabilitado em voo: dois cliques seguidos não podem virar dois apagares */}
            <button
              type="button"
              className="cds-dashboard-confirm-destroy"
              disabled={busy}
              onClick={onConfirm}
            >
              {t('dashboard.deleteConfirm.confirm')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
  /** A história cujo apagamento está sendo perguntado — a pergunta é o próprio estado. */
  const [pendingDelete, setPendingDelete] = useState<SessionSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  /** Uma escolha, os três documentos (ENG-281) — os bytes guardados, sem refazer nada. */
  const onDownload = useCallback(
    async (s: SessionSummary): Promise<void> => {
      const artifacts = await store.getArtifacts(s.id);
      for (const kind of KINDS) saveBytes(filenameFor(kind, s.story_slug), artifacts[kind]);
      setDownloaded((prev) => new Set(prev).add(s.id));
    },
    [store, saveBytes],
  );

  /**
   * Apagar de verdade, depois da pergunta. Fronteira de IO: a recusa do servidor vira
   * frase na tela — trava alheia diz QUEM está com a história (§9.4) — e a história
   * continua listada. A casa se atualiza pela MESMA listagem que a encheu.
   */
  const onDeleteConfirmed = useCallback(async (): Promise<void> => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await store.remove(pendingDelete.id);
      setSessions(await store.list());
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(
        err instanceof LockLostError && err.holder
          ? t('dashboard.deleteConfirm.locked', { holder: err.holder })
          : t('dashboard.deleteConfirm.failed'),
      );
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, store, t]);

  const cards = useMemo(
    () =>
      (sessions ?? []).map((s) => ({
        ...toCard(s, t, locale),
        // o menu vale para TODA história (ENG-281): apagar não espera a conclusão.
        // Baixar espera: os documentos só passam a existir ao guardar (ENG-305).
        menu: (
          <ActionsMenu
            t={t}
            story={s.story_name}
            canDownload={s.status === 'completed'}
            downloaded={downloaded.has(s.id)}
            onDownload={() => void onDownload(s)}
            onDelete={() => setPendingDelete(s)}
          />
        ),
      })),
    [sessions, t, locale, downloaded, onDownload],
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
          {/* O idioma é decisão de casa, antes de abrir sessão (ENG-340), mas deixou
              de ser um clique daqui (ENG-371): vive em Configurações, junto da
              granularidade — o mesmo destino que o cabeçalho do shell oferece. */}
          <button
            type="button"
            className="cds-dashboard-settings"
            aria-label={t('header.settings')}
            title={t('header.settings')}
            onClick={() => navigate('/settings')}
          >
            <GearGlyph />
          </button>
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

      {pendingDelete && (
        <DeleteConfirm
          t={t}
          story={pendingDelete.story_name}
          busy={deleting}
          error={deleteError}
          onCancel={() => {
            setPendingDelete(null);
            setDeleteError(null);
          }}
          onConfirm={() => void onDeleteConfirmed()}
        />
      )}
    </div>
  );
}

export default Dashboard;
