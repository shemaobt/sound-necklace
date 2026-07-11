import { useEffect, useMemo, useState } from 'react';

import type { ConnectivityMonitor } from '../../adapters/connectivity/types';
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
}: {
  session: SessionState;
  sessionId: string;
  review: boolean;
  lock: EditorLock | null;
  online: boolean;
  registry: Record<string, StationComponent>;
  exportStore: ReturnType<typeof appSessionStore>;
  player: Player;
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
  // Só a Export precisa de portas de wiring: o SessionStore app-global + o id da
  // rota (a página conclui/baixa os artefatos com eles).
  const stationProps = currentKey === 'export' ? { store: exportStore, sessionId } : undefined;

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

  const registry = useMemo(() => buildStationRegistry(), []);
  const player = useMemo<Player>(() => ({ stop() {} }), []);

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
        />
      );
    }
  } else {
    const stationKey = route.name === 'login' ? 'login' : 'dashboard';
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
