import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import type { Player as AudioPlayer } from '../../adapters/audio';
import type { ConnectivityMonitor } from '../../adapters/connectivity/types';
import type { VoiceRecorder } from '../../adapters/voice/types';
import { fromSessionDto, toSessionDto, type SessionMeta } from '../../contracts';
import { DEFAULT_FIXTURE_USER } from '../../adapters/sessions';
import { setMode, type Mode, type SessionState } from '../../domain';
import { ConnectionGate } from '../organisms/connection-gate/connection-gate';
import type { EditorLock } from '../state';
import { appStore, sessionStore, useAppStore, useSessionStore } from '../state';
import { AddonsLayer } from './addons-layer';
import { appAuth } from './auth-adapter';
import { buildSessionPlayer, type SessionAudio } from './audio-player';
import { Header } from './header';
import { PlayerSlotProvider, type Player } from './player-slot';
import { buildAdapterRegistry, buildStationRegistry, type StationComponent } from './registries';
import { ReviewBanner } from './review-banner';
import { appSessionStore } from './session-adapter';
import { StationHost } from './station-host';
import { Stepper } from './stepper';
import { stepperStations } from './stepper-model';
import { navigate, useRoute } from './router';
import './app.css';

/** Player itinerante em repouso (sem áudio fiado): só o `stop()` que o slot chama. */
const NO_PLAYBACK: Player = { stop() {} };

/** Estação (diretório em ui/pages) → modo do domínio, para a navegação do fio. */
const KEY_TO_MODE: Record<string, Mode> = {
  escuta1: 'escuta',
  escuta2: 'escuta',
  triagem: 'triagem',
  segmentacao: 'segmentacao',
  mapeamento: 'mapeamento',
};

/**
 * Corpo de uma sessão aberta: fio de contas + chrome de revisão + player + estação.
 * A cauda "Guardar" (export) não tem modo no domínio, então entrar nela é um estado
 * LOCAL (`viewingExport`). Este componente é remontado por `key={sessionId}` no App,
 * de modo que trocar de sessão zera `viewingExport` — sem isso a flag vazaria e uma
 * sessão que nem chegou ao gate abriria na Export (ENG-270).
 */
function SessionStations({
  session,
  sessionId,
  review,
  lock,
  online,
  registry,
  exportStore,
  player,
  recorder,
  onVoiceSaved,
}: {
  session: SessionState;
  sessionId: string;
  review: boolean;
  lock: EditorLock | null;
  online: boolean;
  registry: Record<string, StationComponent>;
  exportStore: ReturnType<typeof appSessionStore>;
  player: AudioPlayer | null;
  recorder: VoiceRecorder | null;
  onVoiceSaved: (path: string) => void;
}) {
  const [viewingExport, setViewingExport] = useState(false);

  const stations = stepperStations(session, { viewingExport });
  const currentKey = stations.find((s) => s.state === 'current')?.key ?? 'escuta1';
  const navigateStation = (key: string) => {
    if (key === 'export') {
      setViewingExport(true);
      return;
    }
    setViewingExport(false);
    const mode = KEY_TO_MODE[key];
    if (mode) sessionStore.getState().apply((s) => setMode(s, mode));
  };
  // Portas de wiring por estação: a Export conclui/baixa com o SessionStore
  // app-global + o id da rota; o Mapeamento grava a resposta por voz (§8.7) E toca
  // os trechos; as demais estações do colar (Escuta 1/2, Triagem, Segmentação)
  // recebem o player para tocar contas/bordas/cenas (§8.2).
  const stationProps =
    currentKey === 'export'
      ? { store: exportStore, sessionId }
      : currentKey === 'mapeamento'
        ? { recorder, player, onVoiceSaved }
        : { player };

  return (
    <>
      <Stepper stations={stations} onNavigate={navigateStation} />
      <ReviewBanner review={review} lock={lock} onUnlock={() => sessionStore.getState().unlock()} />
      <PlayerSlotProvider
        activeKey={currentKey}
        player={player ?? NO_PLAYBACK}
        playerNode={<div className="cds-player" />}
      >
        <ConnectionGate online={online}>
          <main className="cds-app-main">
            <StationHost stationKey={currentKey} registry={registry} stationProps={stationProps} />
          </main>
        </ConnectionGate>
      </PlayerSlotProvider>
    </>
  );
}

/**
 * Assina a porta de conectividade (fixture por default) e reflete o estado tanto
 * localmente (para o gate visual) quanto no session store (que pausa as mutações).
 * Além do monitor, reflete os eventos `online`/`offline` da window — é o que o
 * Playwright dirige com `context.setOffline` (§7.3/§13), sem gambiarra de app: cair
 * offline mostra o aviso e pausa as mutações; voltar retoma sem perda (o estado em
 * memória nunca é limpo). Os listeners são removidos no cleanup do efeito.
 */
function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const registration = buildAdapterRegistry().connectivity;
    const report = (value: boolean) => {
      setOnline(value);
      sessionStore.getState().setOnline(value);
    };
    const monitor = registration ? (registration.fixture() as ConnectivityMonitor) : null;
    const unsub = monitor?.subscribe(report);
    report(monitor ? monitor.isOnline() : navigator.onLine);
    const goOffline = () => report(false);
    const goOnline = () => report(true);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      unsub?.();
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);
  return online;
}

/**
 * Expiração de auth (§7.1) dentro de uma sessão viva: o token do servidor caduca e o
 * app volta ao login SEM tocar o estado em memória — o re-login retoma no mesmo passo.
 * Assina o singleton de auth app-global (o mesmo que o Login/Dashboard usam), de modo
 * que expirar em qualquer rota — inclusive `/session/:id` — roteie ao login.
 * `replace` porque não se volta a uma rota cuja sessão de auth já caducou.
 */
function useAuthExpiry(): void {
  useEffect(() => appAuth().onAuthExpired(() => navigate('/login', { replace: true })), []);
}

/**
 * Reidratação de sessão (§7.3): num reload ou ao retomar do Dashboard, a URL é
 * `/session/:id` mas o `ui/state` em memória está vazio. Carrega o estado salvo da
 * store app-global e o injeta, de modo que a sessão retome no passo corrente em vez
 * de travar em "carregando…". `loadedId` marca o id já hidratado, para não recarregar
 * a cada render e para refazer a carga ao TROCAR de sessão.
 *
 * O try/catch cobre o corpo inteiro (load + `fromSessionDto`): uma sessão sem estado
 * salvo, ou um DTO estruturalmente inválido vindo de localStorage adulterado, degrada
 * para o placeholder "carregando…" em vez de virar rejeição não tratada. Sabida
 * limitação: um id que falha ao carregar não LIMPA a sessão viva anterior (o `ui/state`
 * não expõe reset) — no fluxo real toda sessão tem um DTO inicial persistido pelo Setup,
 * então só afeta ids inexistentes digitados à mão.
 */
function useSessionHydration(
  routeId: string | null,
  metaRef: MutableRefObject<SessionMeta | null>,
): void {
  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (routeId === null || routeId === loadedId.current) return;
    let alive = true;
    void (async () => {
      try {
        const dto = await appSessionStore().load(routeId);
        if (!alive) return;
        loadedId.current = routeId;
        const { state, meta } = fromSessionDto(dto);
        // O meta desta sessão vive num ref para que tanto o autosave quanto o
        // registro de respostas de voz (`onVoiceSaved`) escrevam no MESMO objeto:
        // gravar voz muta `meta.voice`, e a próxima persistência (do domínio ou da
        // própria voz) já o reflete (ENG-276).
        metaRef.current = meta;
        sessionStore.getState().load(state);
        // Trava consultiva (§7.3): se a sessão está em uso por OUTRA pessoa, abre em
        // revisão com o aviso de quem a detém. Este fluxo não adquire trava própria,
        // então qualquer trava por um holder distinto do usuário default da store é
        // alheia. ponytail: sem auto-aquisição de trava — comparo o holder ao default.
        const lock = await appSessionStore().lockStatus(routeId);
        if (!alive) return;
        const foreignHolder =
          lock.held && lock.holder && lock.holder.user_id !== DEFAULT_FIXTURE_USER.user_id
            ? lock.holder.display_name
            : null;
        // Trava/revisão são POR SESSÃO, mas o store é singleton e `load` não os reseta:
        // estabeleço o estado do zero a cada (re)hidratação para a trava/revisão de uma
        // sessão não vazar para a próxima ao TROCAR de sessão in-SPA (sem reload).
        sessionStore.getState().setReview(false);
        sessionStore.getState().setLock(foreignHolder ? { holder: foreignHolder } : null);
        // Liga o autosave contínuo (§7.3): a partir daqui cada mutação do domínio
        // persiste o estado INTEIRO no store app-global, sob o meta desta sessão
        // (granularidade/áudio/consentimento/voz), de modo que um reload retome no
        // passo exato. O adapter debounce+coalesce; o flush no pagehide fecha a janela.
        sessionStore.getState().setAutosave((live) => {
          const m = metaRef.current;
          if (m) appSessionStore().autosave(routeId, toSessionDto(live, m));
        });
      } catch {
        // sessão sem estado salvo ou persistência corrompida — mantém o ui/state atual
      }
    })();
    return () => {
      alive = false;
    };
  }, [routeId, metaRef]);
}

/**
 * Fecha a janela do debounce do autosave (§7.3): o adapter agrupa as escritas, então
 * uma decisão feita instantes antes de a página descarregar ficaria só na fila. Um
 * `flush` no `pagehide` (reload/fechar aba) e ao TROCAR de sessão persiste o pendente
 * agora — o adapter já é no-op se não há nada na fila ou está offline.
 */
function useAutosaveFlush(routeId: string | null): void {
  useEffect(() => {
    if (routeId === null) return;
    const flush = () => void appSessionStore().flush(routeId);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [routeId]);
}

/**
 * Constrói o player de áudio da sessão (ENG-275): re-decodifica o áudio do bucket
 * e liga a ponte de relógio, entregando o `Player` à estação ativa. Reconstrói ao
 * TROCAR de sessão; o cleanup para o player e cancela a ponte. Uma sessão sem áudio
 * resolvível degrada para player dormente (`null`) — as estações lidam com isso.
 */
function useSessionPlayer(routeId: string | null): AudioPlayer | null {
  const [player, setPlayer] = useState<AudioPlayer | null>(null);
  useEffect(() => {
    if (routeId === null) return;
    let alive = true;
    let audio: SessionAudio | null = null;
    void (async () => {
      try {
        const built = await buildSessionPlayer(routeId);
        if (!alive) {
          built.stop();
          return;
        }
        audio = built;
        setPlayer(built.player);
      } catch {
        // sessão sem estado salvo ou áudio não resolvível — player dormente
      }
    })();
    return () => {
      alive = false;
      audio?.stop();
      setPlayer(null);
    };
  }, [routeId]);
  return player;
}

/**
 * Composition root do Colar de Sons (ENG-224): cabeçalho + fio de contas + player
 * itinerante + chrome de revisão/trava + gate online-only, montados sobre as três
 * registries por glob (docs/architecture.md §4). As estações só ADICIONAM arquivos
 * em ui/pages — este shell nunca muda depois.
 */
export function App() {
  const route = useRoute();
  const muted = useAppStore((s) => s.muted);
  const online = useOnline();
  useAuthExpiry();

  const session = useSessionStore((s) => s.session);
  const review = useSessionStore((s) => s.review);
  const lock = useSessionStore((s) => s.lock);

  const routeId = route.name === 'session' ? route.id : null;
  const metaRef = useRef<SessionMeta | null>(null);
  useSessionHydration(routeId, metaRef);
  useAutosaveFlush(routeId);
  const player = useSessionPlayer(routeId);

  // Registra o caminho canônico de uma resposta de voz recém-gravada no `meta.voice`
  // desta sessão e persiste JÁ (autosave + flush): a voz é uma ação discreta e entrar
  // no Export não dispara flush, então esperar o debounce arriscaria o relatório sair
  // com "sem resposta" (§8.7/§10.4, ENG-276). Fora de uma sessão viva/hidratada é no-op.
  const onVoiceSaved = useCallback(
    (path: string) => {
      const meta = metaRef.current;
      const live = sessionStore.getState().session;
      if (!meta || !live || routeId === null) return;
      if (!meta.voice.includes(path)) meta.voice = [...meta.voice, path];
      const store = appSessionStore();
      store.autosave(routeId, toSessionDto(live, meta));
      void store.flush(routeId);
    },
    [routeId],
  );

  const registry = useMemo(() => buildStationRegistry(), []);
  const recorder = useMemo<VoiceRecorder | null>(() => {
    const registration = buildAdapterRegistry().voice;
    return registration ? (registration.fixture() as VoiceRecorder) : null;
  }, []);

  // Login e dashboard são superfícies full-bleed com cabeçalho PRÓPRIO (protótipo
  // Shemá v2, ENG-278) — o shell não empilha o dele por cima. As estações mantêm-no
  // (é lá que vive o botão de som).
  const ownsHeader = route.name === 'login' || route.name === 'dashboard';
  const header = ownsHeader ? null : (
    <Header muted={muted} onToggleMuted={() => appStore.getState().toggleMuted()} />
  );

  let body: React.ReactNode;
  if (route.name === 'session') {
    if (!session) {
      body = <p className="cds-station-fallback">carregando a sessão…</p>;
    } else {
      body = (
        <SessionStations
          key={route.id}
          session={session}
          sessionId={route.id}
          review={review}
          lock={lock}
          online={online}
          registry={registry}
          exportStore={appSessionStore()}
          player={player}
          recorder={recorder}
          onVoiceSaved={onVoiceSaved}
        />
      );
    }
  } else {
    // login/dashboard/setup resolvem a estação homônima; uma rota de topo desconhecida
    // (ex.: /imports, cuja estação já existe — ENG-248) resolve pelo 1º segmento e cai
    // no fallback "em construção" quando não há página.
    const stationKey =
      route.name === 'unknown' ? (/^\/([^/]+)/.exec(route.path)?.[1] ?? 'dashboard') : route.name;
    const station = <StationHost stationKey={stationKey} registry={registry} />;
    // Login e dashboard trazem os PRÓPRIOS landmarks (o dashboard um <header> banner + um
    // <main>; o login um <main>). Embrulhá-los no <main> do shell aninharia esse header
    // dentro de main — e um <header> descendente de main/section não é exposto como
    // `banner` (HTML-AAM). Por isso, quem tem cabeçalho próprio não é embrulhado.
    body = ownsHeader ? station : <main className="cds-app-main">{station}</main>;
  }

  return (
    <div className="cds-app">
      {header}
      {body}
      <AddonsLayer />
    </div>
  );
}
