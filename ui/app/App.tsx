import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import type { Player as AudioPlayer } from '../../adapters/audio';
import type { ConnectivityMonitor } from '../../adapters/connectivity/types';
import { SilentUiSound, type UiSound } from '../../adapters/ui-sound';
import { fromSessionDto, toSessionDto, type SessionMeta } from '../../contracts';
import type { SessionState } from '../../domain';
import type { SaveStatus } from '../molecules';
import { BlockDone, type ClosedBlock } from '../organisms/block-done/block-done';
import { BreakSuggestion } from '../organisms/break-suggestion/break-suggestion';
import { GoalReached } from '../organisms/goal-reached/goal-reached';
import { ConnectionGate } from '../organisms/connection-gate/connection-gate';
import type { EditorLock } from '../state';
import { phrasePalette, scenePalette } from '../tokens';
import {
  appStore,
  progressStore,
  sessionStore,
  useAppStore,
  useSessionClock,
  useSessionStore,
} from '../state';
import { AddonsLayer } from './addons-layer';
import { API_MODE } from './api-config';
import { appAuth, authReady } from './auth-adapter';
import { shouldGateToLogin } from './auth-gate';
import { buildSessionPlayer, createDeferredPlayer, type SessionAudio } from './audio-player';
import { Header } from './header';
import { PlayerSlotProvider, type Player } from './player-slot';
import { NavFooterOutlet, NavFooterProvider } from '../organisms/nav-footer/nav-footer';
import { PreparingSession } from '../organisms/preparing-session/preparing-session';
import { buildAdapterRegistry, buildStationRegistry, type StationComponent } from './registries';
import { ReviewBanner } from './review-banner';
import { appSessionStore } from './session-adapter';
import { StationHost } from './station-host';
import { initTheme, readTheme, toggleTheme, type Theme } from './theme';
import { useEditorLock } from './use-editor-lock';
import { StoryProgress } from './story-progress';

/**
 * Tema em vigor (ENG-391). A verdade mora no atributo do `<html>`, posto pelo script
 * de boot antes da primeira pintura; este estado só existe para o cabeçalho saber
 * qual glifo desenhar. O `initTheme` no efeito reaplica o mesmo valor — é o que
 * cobre o dev server e os testes, onde o boot do index.html não passou.
 */
function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    initTheme();
  }, []);
  return [theme, useCallback(() => setTheme(toggleTheme()), [])];
}

/** Assina o estado do autosave da store (saving/saved) para o selo do header. */
function useAutosaveStatus(): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('saved');
  useEffect(() => appSessionStore().onAutosaveStatus(setStatus), []);
  return status;
}
import { stepperStations } from './stepper-model';
import { navigate, useRoute } from './router';
import './app.css';

/** Player itinerante em repouso (sem áudio fiado): só o `stop()` que o slot chama. */
const NO_PLAYBACK: Player = { stop() {} };

/** O mudo do cabeçalho: a mesma porta, sem voz. Estável entre renders. */
const SILENT_SOUND: UiSound = new SilentUiSound();

/**
 * Corpo de uma sessão aberta: a faixa de progresso + chrome de revisão + player +
 * estação. O fluxo acaba nas Frases (ENG-689): não há cauda depois delas.
 */
function SessionStations({
  session,
  sessionId,
  review,
  lock,
  online,
  registry,
  player,
  sound,
}: {
  session: SessionState;
  sessionId: string;
  review: boolean;
  lock: EditorLock | null;
  online: boolean;
  registry: Record<string, StationComponent>;
  player: AudioPlayer | null;
  sound: UiSound;
}) {
  // O bloco que ACABOU de fechar (ENG-651). Mora aqui, e não na estação, por dois
  // motivos: a estação que confirma é justamente a que sai de cena, e só o shell
  // pode garantir que uma tela cheia por vez suba. Nasce e morre com a vista da
  // sessão — o `key={route.id}` do App remonta este `null` a cada sessão, então
  // reabrir uma já passada do limite não repete nada; um re-render não o perde.
  const [closedBlock, setClosedBlock] = useState<ClosedBlock | null>(null);
  // O relógio líquido da sessão pulsa aqui, no único lugar que sabe QUAL sessão
  // está aberta. Nada disto sai do browser. Desde a ENG-689 ele ACUMULA sem ter
  // leitor: quem mostrava o total era a tela de conclusão, que saiu — o registro
  // fica de pé para quem vier a querê-lo, e apagá-lo é decisão de outro corte.
  useSessionClock(sessionId);
  // Exclusão entre telas cheias, de mão dupla (ENG-653): cada uma diz ao shell que
  // está no ar, e o shell repassa isso como `busy` à outra. A meta de hoje só sabe
  // que chegou porque a faixa do topo — que já calcula as duas pontas — avisa.
  const [goalReached, setGoalReached] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  // O progresso de tela (quanto se ouviu) é por sessão: este componente é
  // remontado por `key={sessionId}`, então zerar na montagem basta — sem isso a
  // barra da sessão seguinte abriria já andada.
  useEffect(() => {
    progressStore.getState().reset();
  }, []);

  const stations = stepperStations(session);
  const currentKey = stations.find((s) => s.state === 'current')?.key ?? 'listen';
  // Portas de wiring por estação: as estações do colar (Escuta 1/2, Triage,
  // Segmentação) recebem o player para tocar contas/bordas/cenas (§8.2). O som da
  // UI vai para todas: cada estação tem decisões que precisam soar (§9).
  const stationProps = {
    player,
    sound,
    onBlockClosed: (block: ClosedBlock) => setClosedBlock(block),
  };

  return (
    <>
      <StoryProgress session={session} onGoalReached={setGoalReached} />
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
      {/* Depois de um bom tempo, uma sugestão de descanso — uma vez por sessão, e
          nunca por cima de algo em curso (ENG-650). Montada aqui, ela nasce e morre
          com a vista da sessão: a tela de espera a substitui inteira, e o `key` por
          sessão rearma a sugestão ao começar, retomar ou reabrir para revisão. */}
      <BreakSuggestion
        busy={goalOpen || blockOpen}
        onTakeBreak={() => navigate('/dashboard')}
        onOpenChange={setBreakOpen}
      />
      {/* A meta de hoje alcançada (ENG-653). Montada ao lado da pausa, pelo mesmo
          motivo: nasce e morre com a vista da sessão, e o `key` por sessão rearma o
          "uma vez só". O chime é o `advance` do UiSound, que o cabeçalho mudo já
          troca pela porta silenciosa. */}
      <GoalReached
        reached={goalReached}
        busy={breakOpen || blockOpen}
        chime={() => sound.advance()}
        onOpenChange={setGoalOpen}
        onStopForToday={() => navigate('/dashboard')}
      />
      {/* Um bloco fechou (ENG-651): a estação seguinte já está montada atrás desta
          tela, e o primário só a descobre. As contas tomam a cor dos dados (§4.2):
          a paleta de frases quando a Segmentação fecha, as cores das próprias
          cenas quando a Triagem fecha.

          Precedência: esta tela NÃO espera pela meta, embora a meta espere por ela.
          É o que o protótipo faz — `pausaShow` e `metaShow` guardam ambos em
          `!blockDone` (L1022, L1030) e o `blockDone` não guarda em nada —, e é a
          única resolução estável: `open` aqui e na meta são DERIVADOS do render, e
          duas derivações que se olham entram em oscilação (as duas abrem no mesmo
          render lendo o `false` anterior da outra, as duas fecham no seguinte, e
          assim sem fim). Com a pausa não há esse risco: o `open` dela é estado
          travado, não derivação, por isso a espera é de mão dupla. */}
      <BlockDone
        block={closedBlock}
        busy={breakOpen}
        onOpenChange={setBlockOpen}
        tints={
          closedBlock === 'segmentacao'
            ? phrasePalette.slice(0, 5)
            : scenePalette.slice(0, Math.min(5, Math.max(1, session.parts.length)))
        }
        // A Segmentação é o FIM do fluxo (ENG-689): não há estação atrás desta tela
        // para o primário entregar, então ele é a saída — e a saída de descansar,
        // que levaria ao mesmo lugar, não é oferecida duas vezes.
        onContinue={() => {
          setClosedBlock(null);
          if (closedBlock === 'segmentacao') navigate('/dashboard');
        }}
        onRest={
          closedBlock === 'segmentacao'
            ? undefined
            : () => {
                setClosedBlock(null);
                navigate('/dashboard');
              }
        }
      />
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
 * Gate de sessão do modo real (ENG-247, §12 emendado): antes de gatear, tenta a
 * RETOMADA silenciosa — o refresh rotativo persistido vira sessão nova sem tela de
 * login (um F5 não expulsa ninguém). Só quando não há o que retomar é que qualquer
 * rota além do login volta ao login, em vez de o app seguir usável e
 * silenciosamente desautenticado (voz do guia no fallback, listagens 401). Na
 * fixture não gateia: o fluxo de teste/dev não exige login.
 */
function useAuthGate(routeName: string): void {
  const [resumed, setResumed] = useState(API_MODE === 'fixture');
  useEffect(() => {
    if (API_MODE === 'fixture') return;
    let alive = true;
    void authReady().finally(() => {
      if (alive) setResumed(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (resumed && shouldGateToLogin(API_MODE, routeName, appAuth().currentUser())) {
      navigate('/login', { replace: true });
    }
  }, [resumed, routeName]);
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
 *
 * Devolve se a sessão já está POSTA, e só então o shell monta uma estação (ENG-511):
 * o `ui/state` sobrevive à troca de rota, então montar de imediato mostrava a estação
 * da sessão ANTERIOR sob a rota da nova, até a hidratação chegar. Uma carga que FALHA
 * também resolve — o placeholder não pode ser eterno.
 */
function useSessionHydration(
  routeId: string | null,
  metaRef: MutableRefObject<SessionMeta | null>,
): boolean {
  const loadedId = useRef<string | null>(null);
  // O id acompanha o veredito para que o de uma sessão não vaze para a próxima
  // enquanto a hidratação dela ainda voa.
  const [placed, setPlaced] = useState<string | null>(null);
  useEffect(() => {
    if (routeId === null || routeId === loadedId.current) return;
    let alive = true;
    void (async () => {
      try {
        const dto = await appSessionStore().load(routeId);
        if (!alive) return;
        loadedId.current = routeId;
        const { state, meta } = fromSessionDto(dto);
        setPlaced(routeId);
        // O meta desta sessão vive num ref para que o autosave escreva sempre no
        // MESMO objeto (granularidade/áudio/consentimento).
        metaRef.current = meta;
        sessionStore.getState().load(state);
        // Revisão é POR SESSÃO, mas o store é singleton e `load` não a reseta:
        // estabeleço do zero a cada (re)hidratação para a revisão de uma sessão não
        // vazar para a próxima ao TROCAR de sessão in-SPA (sem reload). A TRAVA é do
        // `useEditorLock` (ENG-247): ele adquire, renova e escreve o `setLock` — a
        // leitura única que vivia aqui competiria com ele.
        sessionStore.getState().setReview(false);
        // Liga o autosave contínuo (§7.3): a partir daqui cada mutação do domínio
        // persiste o estado INTEIRO no store app-global, sob o meta desta sessão, de
        // modo que um reload retome no passo exato. O adapter debounce+coalesce; o
        // flush no pagehide fecha a janela.
        sessionStore.getState().setAutosave((live) => {
          const m = metaRef.current;
          if (m) appSessionStore().autosave(routeId, toSessionDto(live, m));
        });
      } catch {
        // sessão sem estado salvo ou persistência corrompida — mantém o ui/state atual
        // e segue para a estação do passo salvo
        if (alive) setPlaced(routeId);
      }
    })();
    return () => {
      alive = false;
    };
  }, [routeId, metaRef]);
  return routeId !== null && placed === routeId;
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
function useSessionPlayer(routeId: string | null): {
  player: AudioPlayer | null;
  /** Volume master do playback (ENG-314): vale já, e re-aplica ao áudio que ainda chega. */
  setGain: (value: number) => void;
} {
  // Player deferido desde a montagem: no modo real, baixar+decodificar o áudio
  // leva segundos, e com `null` a estação descartava o primeiro clique em
  // silêncio (ENG-313). Agora o gesto vira intenção e soa assim que o áudio chega.
  const deferred = useMemo(() => (routeId === null ? null : createDeferredPlayer()), [routeId]);
  // instância cujo build falhou (sessão sem estado salvo ou áudio não resolvível):
  // volta ao player dormente, como antes do deferido
  const [dead, setDead] = useState<AudioPlayer | null>(null);
  const audioRef = useRef<SessionAudio | null>(null);
  const volumeRef = useRef(1);
  useEffect(() => {
    if (routeId === null || deferred === null) return;
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
        audioRef.current = built;
        built.setGain(volumeRef.current); // o reforço pedido antes do build vale agora
        deferred.attach(built.player);
      } catch {
        if (alive) setDead(deferred.player);
      }
    })();
    return () => {
      alive = false;
      audio?.stop();
      audioRef.current = null;
      deferred.player.stop();
    };
  }, [routeId, deferred]);
  const setGain = useCallback((value: number) => {
    volumeRef.current = value;
    audioRef.current?.setGain(value);
  }, []);
  return {
    player: deferred !== null && deferred.player !== dead ? deferred.player : null,
    setGain,
  };
}

/**
 * Composition root do Colar de Sons (ENG-224): cabeçalho + faixa de progresso +
 * player itinerante + chrome de revisão/trava + gate online-only, montados sobre as três
 * registries por glob (docs/architecture.md §4). As estações só ADICIONAM arquivos
 * em ui/pages — este shell nunca muda depois.
 */
export function App() {
  const route = useRoute();
  const muted = useAppStore((s) => s.muted);
  const [theme, onToggleTheme] = useTheme();
  const online = useOnline();
  useAuthExpiry();
  useAuthGate(route.name);

  const session = useSessionStore((s) => s.session);
  const review = useSessionStore((s) => s.review);
  const lock = useSessionStore((s) => s.lock);

  const routeId = route.name === 'session' ? route.id : null;
  const metaRef = useRef<SessionMeta | null>(null);
  const ready = useSessionHydration(routeId, metaRef);
  // A trava consultiva (§7.3) tem dono único: adquire ao abrir, renova a cada 15 s,
  // solta ao sair — e abre em revisão se outra pessoa a detém. Vale nos dois modos
  // (a fixture também serve trava), então há UM caminho de código, não dois.
  useEditorLock(routeId);
  useAutosaveFlush(routeId);
  const autosave = useAutosaveStatus();
  const { player, setGain: setStoryGain } = useSessionPlayer(routeId);
  // Booster de volume da história (ENG-314): estado do shell; >1 reforça gravações
  // baixas. Vive entre sessões da mesma visita — quem precisa de reforço, precisa nelas todas.
  const [storyVolume, setStoryVolume] = useState(1);
  const onStoryVolume = useCallback(
    (v: number) => {
      setStoryVolume(v);
      setStoryGain(v);
    },
    [setStoryGain],
  );

  const registry = useMemo(() => buildStationRegistry(), []);
  // O som da UI é a implementação REAL: tocar de volta É a feature num app
  // ear-first. Mudo troca a PORTA pela silenciosa — assim nenhum chamador precisa
  // saber o que é estar mudo, e o botão do cabeçalho passa a silenciar de fato
  // tudo o que a UI toca (antes só calava a voz da entrevista).
  const uiSound = useMemo<UiSound>(() => {
    const registration = buildAdapterRegistry()['ui-sound'];
    return registration ? (registration.real() as UiSound) : new SilentUiSound();
  }, []);
  const sound = muted ? SILENT_SOUND : uiSound;

  // Login e dashboard são superfícies full-bleed com cabeçalho PRÓPRIO (protótipo
  // Shemá v2, ENG-278) — o shell não empilha o dele por cima. As estações mantêm-no
  // (é lá que vive o botão de som).
  const ownsHeader = route.name === 'login' || route.name === 'dashboard';
  const header = ownsHeader ? null : (
    <Header
      muted={muted}
      onToggleMuted={() => appStore.getState().toggleMuted()}
      onBack={() => navigate('/dashboard')}
      // o tema é global e sem consequência de conteúdo: pode trocar em qualquer estação
      theme={theme}
      onToggleTheme={onToggleTheme}
      // o booster só faz sentido com uma sessão tocável aberta (ENG-314)
      volume={storyVolume}
      onVolume={route.name === 'session' ? onStoryVolume : undefined}
      // o selo de salvamento acompanha a edição de uma sessão aberta (§7.3)
      autosave={route.name === 'session' ? autosave : undefined}
    />
  );

  let body: React.ReactNode;
  if (route.name === 'session') {
    if (!session || !ready) {
      // a espera vira palco (ENG-312): contas em onda + uma linha, nunca um
      // parágrafo parado — cobre criar E retomar (hidratação + decode do áudio). A
      // espera dura até a hidratação DESTA rota resolver: antes disso não se sabe onde
      // a sessão abre, e o que havia em memória é da sessão anterior (ENG-511).
      body = <PreparingSession />;
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
          player={player}
          sound={sound}
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

  // O rodapé de navegação (protótipo v3 §1) fica no fim do shell e só existe quando
  // a estação ativa publica a sua navegação — login, painel e telas de espera não
  // publicam nada e simplesmente não o têm, sem lista de exceções aqui.
  return (
    <NavFooterProvider>
      <div className="cds-app">
        {header}
        {body}
        <NavFooterOutlet />
        <AddonsLayer />
      </div>
    </NavFooterProvider>
  );
}
