/**
 * Fiação do player de áudio no composition root (ENG-275). As estações do colar
 * foram construídas prontas para áudio (recebem um `Player` por prop), o engine
 * existe (adapters/audio, ENG-217) — só faltava construir o player em runtime e
 * entregá-lo à estação ativa. Este módulo é o análogo de áudio do que a ENG-270
 * fez pela alcançabilidade da Export.
 *
 * Modo: FIXTURE. O bucket fixture serve o áudio como JSON de `PcmSpec` (não WAV),
 * que só o `FixtureAudioEngine` decodifica — o `WebAudioEngine` real precisaria de
 * bytes decodáveis, que o modo fixture não tem (o toggle real por ambiente é a
 * ENG-247). Como o relógio do fixture só anda por `advance()`, uma PONTE de
 * `requestAnimationFrame` o avança em tempo real, de modo que o playback e o
 * `onHead` progridem no browser (Playwright dá tique no rAF) — a alternativa
 * oferecida pela issue.
 *
 * Só pages/`ui/app` podem importar adapters (regra de dependência): a fiação mora
 * aqui, no composition root.
 */

import {
  FixtureAudioEngine,
  WebAudioEngine,
  type FixtureTransport,
  type HeadListener,
  type Player,
  type PlayerState,
  type Unsubscribe,
} from '../../adapters/audio';
import { fromSessionDto } from '../../contracts';
import { API_MODE } from './api-config';
import { appBucket } from './bucket-adapter';
import { appSessionStore } from './session-adapter';

export interface SessionAudio {
  player: Player;
  /** Volume master do playback da sessão (1 = neutro; >1 = reforço, ENG-314). */
  setGain: (value: number) => void;
  /** Para o player e cancela a ponte de relógio (chamado ao trocar/fechar a sessão). */
  stop: () => void;
}

const IDLE_STATE: PlayerState = { key: null, playing: false, paused: false };

/**
 * Player deferido: as estações recebem um `Player` utilizável DESDE a montagem,
 * enquanto `buildSessionPlayer` ainda baixa e decodifica o áudio (segundos no
 * modo real). Sem isto o primeiro clique numa conta morre em silêncio — a
 * estação recebia `player = null` e descartava o gesto (ENG-313). Durante a
 * espera, só a ÚLTIMA intenção fica guardada (novo clique substitui o anterior,
 * como no player real, que troca a faixa) e é executada no `attach`; `stop()`
 * descarta a intenção. Inscrições de `onHead` são repassadas ao player real.
 */
export function createDeferredPlayer(): { player: Player; attach: (real: Player) => void } {
  let inner: Player | null = null;
  let intent: ((p: Player) => void) | null = null;
  const listeners = new Set<HeadListener>();
  const unsubs = new Map<HeadListener, Unsubscribe>();

  const exec = (run: (p: Player) => void): void => {
    if (inner) run(inner);
    else intent = run;
  };

  const player: Player = {
    toggle: (key, s, e) => exec((p) => p.toggle(key, s, e)),
    play: (s, e) => exec((p) => p.play(s, e)),
    playEdge: (b) => exec((p) => p.playEdge(b)),
    stop: () => {
      intent = null;
      inner?.stop();
    },
    get state(): PlayerState {
      return inner ? inner.state : IDLE_STATE;
    },
    onHead: (cb) => {
      listeners.add(cb);
      if (inner) unsubs.set(cb, inner.onHead(cb));
      return () => {
        listeners.delete(cb);
        unsubs.get(cb)?.();
        unsubs.delete(cb);
      };
    },
  };

  const attach = (real: Player): void => {
    inner = real;
    listeners.forEach((cb) => unsubs.set(cb, real.onHead(cb)));
    const run = intent;
    intent = null;
    run?.(real);
  };

  return { player, attach };
}

/**
 * Ponte de relógio: o `FixtureTransport` só avança em `advance()`; dirige-o por
 * `requestAnimationFrame` com o delta real entre frames, para o progresso do
 * playback e o `onHead` andarem no browser. Devolve o cancelador.
 */
export function startClockBridge(transport: FixtureTransport): () => void {
  let raf = 0;
  let last: number | null = null;
  const tick = (now: number): void => {
    if (last !== null) transport.advance((now - last) / 1000);
    last = now;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/**
 * Constrói o player de áudio da sessão re-decodificando o áudio do bucket que o
 * Setup registrou (`meta.bucketAudioId`) e usando o `beadSec` travado da sessão.
 * Rejeita se a sessão não tiver estado salvo ou o áudio não resolver no bucket —
 * o chamador degrada para player dormente (as estações lidam com `player = null`).
 */
export async function buildSessionPlayer(sessionId: string): Promise<SessionAudio> {
  const dto = await appSessionStore().load(sessionId);
  const { state, meta } = fromSessionDto(dto);
  const bytes = await appBucket().fetchBytes(meta.bucketAudioId);

  if (API_MODE === 'real') {
    // engine real: o relógio é o do AudioContext e o player se auto-dirige por
    // transport.requestFrame — a ponte de rAF é uma necessidade só do fixture
    const engine = new WebAudioEngine();
    try {
      const decoded = await engine.decode(bytes);
      const player = engine.createPlayer(decoded, state.beadSec);
      return {
        player,
        setGain: (v) => engine.setGain(v),
        // fecha o AudioContext junto: cada sessão cria um, e o navegador corta o
        // playback da aba depois de ~meia dúzia de contexts vivos
        stop: () => {
          player.stop();
          engine.close();
        },
      };
    } catch (err) {
      engine.close(); // decode falhou: o context recém-aberto não pode vazar
      throw err;
    }
  }

  const engine = new FixtureAudioEngine();
  const decoded = await engine.decode(bytes);
  const player = engine.createPlayer(decoded, state.beadSec);
  const stopBridge = startClockBridge(engine.transport);
  return {
    player,
    setGain: (v) => engine.setGain(v),
    stop: () => {
      stopBridge();
      player.stop();
    },
  };
}
