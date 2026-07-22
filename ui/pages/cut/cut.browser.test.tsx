import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPlayer,
  type DecodedAudio,
  FixtureTransport,
  type Player,
} from '../../../adapters/audio';
import {
  buildBeads,
  clickBead,
  confirmPart,
  createSession,
  type SessionState,
} from '../../../domain';
import { sessionStore } from '../../state';
import Cut from './index';

/**
 * Modelo de clique em Chromium real (a geometria do colar só existe com layout):
 * cortando uma cena, o 1º toque fixa o início e toca só aquela conta, o 2º toca o
 * intervalo, e um 3º aproxima a borda mais próxima e toca SÓ a janela da fronteira
 * — provando a fiação colar↔domínio↔áudio de §8.2 que jsdom não alcança.
 */

const WIDTH = 500; // slot 25 → 20 contas por linha
const DURATION = 2.5;
const BEAD_SEC = 0.25; // 10 contas (0…9)

/**
 * Player-espião: registra as chamadas sem tocar áudio. Serve às asserções de
 * DESPACHO (qual método, qual span) — nunca às de pausa: o `state` aqui é literal
 * e nada o move, então quem afirma pausa usa o `realPlayer` abaixo.
 */
type Call =
  { m: 'play' | 'playEdge'; args: number[] } | { m: 'toggle'; key: string; args: number[] };
function spyPlayer(): { player: Player; calls: Call[] } {
  const calls: Call[] = [];
  const player: Player = {
    toggle: (k, s, e) => calls.push({ m: 'toggle', key: k, args: [s, e] }),
    play: (s, e) => calls.push({ m: 'play', args: [s, e] }),
    playEdge: (b) => calls.push({ m: 'playEdge', args: [b] }),
    stop: () => {},
    state: { key: null, playing: false, paused: false },
    onHead: () => () => {},
  };
  return { player, calls };
}

function cutting(): SessionState {
  const base = createSession({
    durationSec: DURATION,
    beadSec: BEAD_SEC,
    beads: buildBeads(DURATION, BEAD_SEC),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  return {
    ...base,
    whole: { ...base.whole, confirmed: true },
    mode: 'escuta',
    parts: [
      {
        part_id: 'PT1',
        span: null,
        locked: false,
        scene_kind: null,
        scene_kind_confidence: null,
        tag_state: 'pending',
      },
    ],
    current: { layer: 'parts', index: 0 },
    selection: null,
    pendingStart: null,
  };
}

/**
 * A cena um travada em 0…3, com a próxima já pré-ancorada na emenda — construída
 * pelo próprio domínio (cortar → travar), não à mão, para o estado ser o mesmo que
 * o app produz.
 */
function withLockedScene(): SessionState {
  const { state: s1 } = clickBead(cutting(), 0);
  const { state: s2 } = clickBead(s1, 3);
  const locked = confirmPart(s2, 0);
  if (!locked.ok) throw new Error(`fixture: ${locked.error.message}`);
  return locked.state;
}

function mount(player: Player): { host: HTMLDivElement; root: Root; el: HTMLElement } {
  const host = document.createElement('div');
  host.style.width = `${WIDTH}px`;
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<Cut player={player} />));
  const el = host.querySelector('.cds-necklace') as HTMLElement;
  return { host, root, el };
}

function firePointer(el: HTMLElement, index: number): void {
  // centro do PRÓPRIO elemento da conta — imune a tamanho/offset de centralização
  const bead = el.querySelector(`.cds-necklace-bead[data-idx="${index}"]`);
  if (!bead) throw new Error(`conta ${index} não renderizada`);
  const r = bead.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  // um TAP real: down + up no mesmo ponto. O up só importa quando a conta é um
  // punho de arrasto (ENG-342) — fim de cena travada, agora inclusive o da última
  // cena: o tap só se confirma no pointerup, sem movimento (necklace.endDrag).
  const at = (type: string) =>
    el.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        buttons: type === 'pointerdown' ? 1 : 0,
      }),
    );
  at('pointerdown');
  at('pointerup');
}

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});

describe('Escuta 2 — modelo de clique com áudio na hora (PRD v2 §8.2/§8.4)', () => {
  it('clicar o começo OUVE a história; clicar além define só o FIM, sem interromper (regras 1–3)', () => {
    const { player, calls } = spyPlayer();
    sessionStore.getState().load(cutting()); // fronteira 0; colar de 10 contas (0…9)
    const { root, el } = mount(player);

    // clicar o começo (fronteira 0) → ouvir a história a partir dali; não seleciona
    firePointer(el, 0);
    expect(calls.at(-1)).toEqual({ m: 'play', args: [0, 9] });
    expect(sessionStore.getState().session!.selection).toBeNull();

    // clicar além → define SÓ o FIM (o começo fica fixo em 0). head=null (o espião
    // não avança) → o playhead não chegou, então nada toca (nem para)
    const n = calls.length;
    firePointer(el, 6);
    expect(sessionStore.getState().session!.selection).toEqual({ s: 0, e: 6 });
    expect(sessionStore.getState().session!.pendingStart).toBeNull();
    expect(calls.length).toBe(n);

    // reclicar o começo → ouvir de novo
    firePointer(el, 0);
    expect(calls.at(-1)).toEqual({ m: 'play', args: [0, 9] });
    root.unmount();
  });
});

/**
 * Player REAL sobre transport de avanço manual — não um espião. A pausa mora no
 * adapter (mesma chave → suspend) e a chave só existe se alguém a setou, então
 * espião com `state` fabricado provaria o fake, não a estação.
 */
const DECODED: DecodedAudio = {
  duration: DURATION,
  pcm: { numberOfChannels: 1, sampleRate: 8000, getChannelData: () => new Float32Array(20000) },
};
function realPlayer(): { player: Player; transport: FixtureTransport } {
  const transport = new FixtureTransport();
  return { player: createPlayer(transport, DECODED, BEAD_SEC), transport };
}
/** Avança rodando os frames como o rAF real, com o React vendo cada head. */
function advanceBy(transport: FixtureTransport, seconds: number, step = 0.05): void {
  let left = seconds;
  while (left > 1e-12) {
    const dt = Math.min(step, left);
    flushSync(() => transport.advance(dt));
    left -= dt;
  }
}

describe('Escuta 2 — a conta acesa pausa, venha o playback de onde vier (ENG-297)', () => {
  it('durante uma prévia de borda, tocar a conta acesa PARA — não reinicia a cena', () => {
    const { player, transport } = realPlayer();
    sessionStore.getState().load(withLockedScene());
    const { root, el } = mount(player);

    // a janela da prévia é max(1, round(1/beadSec)) = 4 contas por lado → 0…8:
    // a cabeça nasce DENTRO da cena travada 0…3, e o playback é sem chave
    flushSync(() => player.playEdge(4));
    advanceBy(transport, 0.6); // cabeça ~conta 2, dentro da PT1

    firePointer(el, 2); // toca a conta acesa

    // sem o guard: `toggle('PT1')` não casa com key=null → troca de faixa e a cena
    // RECOMEÇA do zero, justamente para quem tocou querendo parar
    expect(player.state.playing).toBe(false);
    root.unmount();
  });

  it('durante o playback de uma seleção, a conta acesa não é clique morto', () => {
    const { player, transport } = realPlayer();
    sessionStore.getState().load(withLockedScene());
    const { root, el } = mount(player);

    flushSync(() => player.play(4, 8)); // seleção em curso, sem chave, contas LIVRES
    advanceBy(transport, 0.3); // cabeça ~conta 5

    firePointer(el, 5);

    expect(player.state.playing).toBe(false);
    root.unmount();
  });

  it('a cena tocando por chave própria pausa na conta acesa, e não para', () => {
    const { player, transport } = realPlayer();
    sessionStore.getState().load(withLockedScene());
    const { root, el } = mount(player);

    firePointer(el, 1); // toca a cena a partir da conta 1 → toggle('PT1:1', 1, 3)
    advanceBy(transport, 0.3);
    expect(player.state).toEqual({ key: 'PT1:1', playing: true, paused: false });

    // a conta acesa DE FATO — o colar só roteia para `onHeadTap` nela
    const acesa = el.querySelector('.cds-necklace-bead[data-play="head"]');
    firePointer(el, Number(acesa!.getAttribute('data-idx')));

    // pausa (retomável), não `stop`: aqui existe chave, logo existe o que retomar
    expect(player.state).toEqual({ key: 'PT1:1', playing: true, paused: true });
    root.unmount();
  });
});

describe('Escuta 2 — uma cena travada pode ser ouvida (ENG-293)', () => {
  it('tocar numa conta da cena travada toca A PARTIR dela até o fim, e deixa o corte quieto', () => {
    const { player, calls } = spyPlayer();
    sessionStore.getState().load(withLockedScene());
    const { root, el } = mount(player);

    firePointer(el, 2); // conta no meio da cena um (0…3)

    // toca de 2 até o fim da cena (3), pela chave por conta (regra 4); o log inteiro,
    // não só a última: um toggle seguido de play seriam dois sons
    expect(calls).toEqual([{ m: 'toggle', key: 'PT1:2', args: [2, 3] }]);
    // e a emenda costurada sobrevive: sem isto o clique é clampado até a emenda e
    // CONSOME a pré-ancoragem, fechando uma cena degenerada de uma conta só onde a
    // próxima ia começar (o toggle acima é quem prova que o toque de fato chegou)
    const depois = sessionStore.getState().session!;
    expect(depois.pendingStart).toBe(4);
    expect(depois.selection).toEqual({ s: 4, e: 4 });
    root.unmount();
  });

  it('a conta ainda livre define o FIM da próxima cena, da emenda até ela', () => {
    const { player, calls } = spyPlayer();
    sessionStore.getState().load(withLockedScene()); // PT2 pendente, fronteira 4
    const { root, el } = mount(player);

    const n = calls.length;
    firePointer(el, 6);

    expect(sessionStore.getState().session!.selection).toEqual({ s: 4, e: 6 });
    expect(sessionStore.getState().session!.pendingStart).toBeNull();
    expect(calls.length).toBe(n); // head=null → só define o fim, não toca
    root.unmount();
  });

  it('no modo revisão a cena travada continua audível — a estação vira só-ouvir', () => {
    const { player, calls } = spyPlayer();
    // `review` do domínio: o `clickBead` devolve `play: null` e a estação ficaria
    // muda (redesign §5.3 chama a revisão de play-only). Como a pergunta da cena
    // travada vem antes do redutor, o colar segue tocando o que já está travado.
    sessionStore.getState().load({ ...withLockedScene(), review: true });
    const { root, el } = mount(player);

    firePointer(el, 2);

    expect(calls).toEqual([{ m: 'toggle', key: 'PT1:2', args: [2, 3] }]);
    root.unmount();
  });

  it('tocar OUTRA conta da cena travada pula para ela (chave por conta, regra 4)', () => {
    const { player, calls } = spyPlayer();
    sessionStore.getState().load(withLockedScene());
    const { root, el } = mount(player);

    firePointer(el, 3); // toca a partir da 3
    firePointer(el, 1); // OUTRA conta → chave nova = pula para ela

    expect(calls).toEqual([
      { m: 'toggle', key: 'PT1:3', args: [3, 3] },
      { m: 'toggle', key: 'PT1:1', args: [1, 3] },
    ]);
    root.unmount();
  });

  it('tocar a MESMA conta de partida pausa e retoma no lugar (mesma chave)', () => {
    const { player, transport } = realPlayer();
    sessionStore.getState().load(withLockedScene());
    const { root, el } = mount(player);

    firePointer(el, 1); // toca a partir da conta 1
    advanceBy(transport, 0.2); // a cabeça avança
    expect(player.state).toEqual({ key: 'PT1:1', playing: true, paused: false });

    firePointer(el, 1); // a MESMA conta de partida → pausa
    expect(player.state).toEqual({ key: 'PT1:1', playing: true, paused: true });

    firePointer(el, 1); // de novo → retoma
    expect(player.state).toEqual({ key: 'PT1:1', playing: true, paused: false });
    root.unmount();
  });
});
