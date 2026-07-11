import { useEffect, useMemo, useState } from 'react';

import type { ConnectivityMonitor } from '../../adapters/connectivity/types';
import { setMode, type Mode } from '../../domain';
import { ConnectionGate } from '../organisms/connection-gate/connection-gate';
import { appStore, sessionStore, useAppStore, useSessionStore } from '../state';
import { AddonsLayer } from './addons-layer';
import { Header } from './header';
import { PlayerSlotProvider, type Player } from './player-slot';
import { buildAdapterRegistry, buildStationRegistry } from './registries';
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

  // A cauda "Guardar" (export) não tem modo no domínio; o shell a marca como conta
  // atual localmente ao entrar nela pelo fio de contas (ENG-270).
  const [viewingExport, setViewingExport] = useState(false);

  const registry = useMemo(() => buildStationRegistry(), []);
  const exportStore = useMemo(() => appSessionStore(), []);
  const player = useMemo<Player>(() => ({ stop() {} }), []);

  const header = <Header muted={muted} onToggleMuted={() => appStore.getState().toggleMuted()} />;

  let body: React.ReactNode;
  if (route.name === 'session') {
    if (!session) {
      body = <p className="cds-station-fallback">carregando a sessão…</p>;
    } else {
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
      const stationProps =
        currentKey === 'export' ? { store: exportStore, sessionId: route.id } : undefined;
      body = (
        <>
          <Stepper stations={stations} onNavigate={navigateStation} />
          <ReviewBanner
            review={review}
            lock={lock}
            onUnlock={() => sessionStore.getState().unlock()}
          />
          <PlayerSlotProvider
            activeKey={currentKey}
            player={player}
            playerNode={<div className="cds-player" />}
          >
            <ConnectionGate online={online}>
              <main className="cds-app-main">
                <StationHost
                  stationKey={currentKey}
                  registry={registry}
                  stationProps={stationProps}
                />
              </main>
            </ConnectionGate>
          </PlayerSlotProvider>
        </>
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
