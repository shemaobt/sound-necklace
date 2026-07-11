import { useEffect, useMemo, useRef, useState } from 'react';

import type { ConnectivityMonitor } from '../../adapters/connectivity/types';
import type { VoiceRecorder } from '../../adapters/voice/types';
import { fromSessionDto, toSessionDto } from '../../contracts';
import { setMode, type Mode, type SessionState } from '../../domain';
import { ConnectionGate } from '../organisms/connection-gate/connection-gate';
import type { EditorLock } from '../state';
import { appStore, sessionStore, useAppStore, useSessionStore } from '../state';
import { AddonsLayer } from './addons-layer';
import { Header } from './header';
import { PlayerSlotProvider, type Player } from './player-slot';
import { buildAdapterRegistry, buildStationRegistry, type StationComponent } from './registries';
import { ReviewBanner } from './review-banner';
import { appSessionStore } from './session-adapter';
import { StationHost } from './station-host';
import { Stepper } from './stepper';
import { stepperStations } from './stepper-model';
import { useRoute } from './router';
import './app.css';

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
}: {
  session: SessionState;
  sessionId: string;
  review: boolean;
  lock: EditorLock | null;
  online: boolean;
  registry: Record<string, StationComponent>;
  exportStore: ReturnType<typeof appSessionStore>;
  player: Player;
  recorder: VoiceRecorder | null;
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
  // app-global + o id da rota; o Mapeamento grava a resposta por voz com o
  // recorder fixture (§8.7). As demais estações não precisam de props.
  const stationProps =
    currentKey === 'export'
      ? { store: exportStore, sessionId }
      : currentKey === 'mapeamento'
        ? { recorder }
        : undefined;

  return (
    <>
      <Stepper stations={stations} onNavigate={navigateStation} />
      <ReviewBanner review={review} lock={lock} onUnlock={() => sessionStore.getState().unlock()} />
      <PlayerSlotProvider
        activeKey={currentKey}
        player={player}
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
 */
function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const registration = buildAdapterRegistry().connectivity;
    if (!registration) return;
    const monitor = registration.fixture() as ConnectivityMonitor;
    const report = (value: boolean) => {
      setOnline(value);
      sessionStore.getState().setOnline(value);
    };
    report(monitor.isOnline());
    return monitor.subscribe(report);
  }, []);
  return online;
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
function useSessionHydration(routeId: string | null): void {
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
        sessionStore.getState().load(state);
        // Liga o autosave contínuo (§7.3): a partir daqui cada mutação do domínio
        // persiste o estado INTEIRO no store app-global, sob o meta desta sessão
        // (granularidade/áudio/consentimento), de modo que um reload retome no passo
        // exato. O adapter debounce+coalesce; o flush no pagehide fecha a janela.
        sessionStore.getState().setAutosave((live) => {
          appSessionStore().autosave(routeId, toSessionDto(live, meta));
        });
      } catch {
        // sessão sem estado salvo ou persistência corrompida — mantém o ui/state atual
      }
    })();
    return () => {
      alive = false;
    };
  }, [routeId]);
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
 * Composition root do Colar de Sons (ENG-224): cabeçalho + fio de contas + player
 * itinerante + chrome de revisão/trava + gate online-only, montados sobre as três
 * registries por glob (docs/architecture.md §4). As estações só ADICIONAM arquivos
 * em ui/pages — este shell nunca muda depois.
 */
export function App() {
  const route = useRoute();
  const muted = useAppStore((s) => s.muted);
  const online = useOnline();

  const session = useSessionStore((s) => s.session);
  const review = useSessionStore((s) => s.review);
  const lock = useSessionStore((s) => s.lock);

  const routeId = route.name === 'session' ? route.id : null;
  useSessionHydration(routeId);
  useAutosaveFlush(routeId);

  const registry = useMemo(() => buildStationRegistry(), []);
  const player = useMemo<Player>(() => ({ stop() {} }), []);
  const recorder = useMemo<VoiceRecorder | null>(() => {
    const registration = buildAdapterRegistry().voice;
    return registration ? (registration.fixture() as VoiceRecorder) : null;
  }, []);

  const header = <Header muted={muted} onToggleMuted={() => appStore.getState().toggleMuted()} />;

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
        />
      );
    }
  } else {
    // login/dashboard/setup resolvem a estação homônima; uma rota de topo desconhecida
    // (ex.: /imports, cuja estação já existe — ENG-248) resolve pelo 1º segmento e cai
    // no fallback "em construção" quando não há página.
    const stationKey =
      route.name === 'unknown' ? (/^\/([^/]+)/.exec(route.path)?.[1] ?? 'dashboard') : route.name;
    body = (
      <main className="cds-app-main">
        <StationHost stationKey={stationKey} registry={registry} />
      </main>
    );
  }

  return (
    <div className="cds-app">
      {header}
      {body}
      <AddonsLayer />
    </div>
  );
}
