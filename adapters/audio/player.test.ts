/**
 * Núcleo de playback — port 1:1 de togglePlay/playRange/stopPlayback/
 * startProgress (referência L609–659; PRD v2 §8.2). Testado pela fronteira da
 * porta (state/onHead), dirigido pelo transport fixture de avanço manual.
 */

import { describe, expect, it } from 'vitest';

import type { DecodedAudio, Player } from './types';
import { FixtureTransport } from './fixture';
import { createPlayer, edgeWindow } from './player';

/** 10 contas de 0.25s (duração 2.5s); pcm irrelevante para o player. */
const BEAD_SEC = 0.25;
const DECODED: DecodedAudio = {
  duration: 2.5,
  pcm: {
    numberOfChannels: 1,
    sampleRate: 8000,
    getChannelData: () => new Float32Array(20000),
  },
};

function makePlayer(): { player: Player; transport: FixtureTransport; heads: (number | null)[] } {
  const transport = new FixtureTransport();
  const player = createPlayer(transport, DECODED, BEAD_SEC);
  const heads: (number | null)[] = [];
  player.onHead((h) => heads.push(h));
  return { player, transport, heads };
}

/** Avança em passos pequenos, rodando os frames a cada passo (como rAF real). */
function advanceBy(transport: FixtureTransport, seconds: number, step = 0.05): void {
  let left = seconds;
  while (left > 1e-12) {
    const dt = Math.min(step, left);
    transport.advance(dt);
    left -= dt;
  }
}

describe('toggle — semântica da referência (togglePlay L649–655)', () => {
  it('inicia uma faixa e reflete o dono no state', () => {
    const { player, transport } = makePlayer();
    player.toggle('cena', 2, 5);
    transport.advance(0);
    expect(player.state).toEqual({ key: 'cena', playing: true, paused: false });
  });

  it('mesma key pausa; com pausa o head congela mesmo com o tempo do mundo passando', () => {
    const { player, transport, heads } = makePlayer();
    player.toggle('cena', 0, 9);
    advanceBy(transport, 0.6);
    player.toggle('cena', 0, 9); // pausa
    expect(player.state.paused).toBe(true);
    expect(player.state.playing).toBe(true);
    const before = heads[heads.length - 1];
    expect(before).not.toBeUndefined();
    expect(before).not.toBeNull();
    advanceBy(transport, 1.0);
    expect(heads[heads.length - 1]).toBe(before);
  });

  it('mesma key de novo continua de onde parou', () => {
    const { player, transport, heads } = makePlayer();
    player.toggle('cena', 0, 9);
    advanceBy(transport, 0.6); // head ≈ conta 2
    player.toggle('cena', 0, 9); // pausa
    const atPause = heads[heads.length - 1];
    player.toggle('cena', 0, 9); // continua
    expect(player.state.paused).toBe(false);
    transport.advance(0);
    // continua do ponto da pausa (um recomeço voltaria à conta 0)
    expect(heads[heads.length - 1]).toBe(atPause);
    advanceBy(transport, 0.5);
    const last = heads[heads.length - 1];
    expect(last).not.toBeNull();
    expect(last).toBeGreaterThanOrEqual(4);
  });

  it('key diferente troca a faixa — só uma coisa toca por vez', () => {
    const { player, transport, heads } = makePlayer();
    player.toggle('a', 0, 9);
    advanceBy(transport, 0.3);
    player.toggle('b', 6, 9);
    transport.advance(0);
    expect(player.state).toEqual({ key: 'b', playing: true, paused: false });
    heads.length = 0;
    advanceBy(transport, 0.3);
    // todos os heads emitidos pertencem à faixa de b
    expect(heads.length).toBeGreaterThan(0);
    for (const h of heads) {
      expect(h).not.toBeNull();
      expect(h).toBeGreaterThanOrEqual(6);
      expect(h).toBeLessThanOrEqual(9);
    }
  });

  it('key diferente durante pausa troca e volta a tocar (resume incondicional do playRange)', () => {
    const { player, transport, heads } = makePlayer();
    player.toggle('a', 0, 9);
    advanceBy(transport, 0.3);
    player.toggle('a', 0, 9); // pausa (transport suspenso)
    player.toggle('b', 6, 9);
    heads.length = 0;
    advanceBy(transport, 0.3);
    expect(player.state).toEqual({ key: 'b', playing: true, paused: false });
    expect(heads.length).toBeGreaterThan(0);
  });

  it('após o fim natural, o mesmo key recomeça do início', () => {
    const { player, transport, heads } = makePlayer();
    player.toggle('cena', 4, 5);
    advanceBy(transport, 1.0); // faixa de 0.5s termina
    expect(player.state).toEqual({ key: null, playing: false, paused: false });
    expect(heads[heads.length - 1]).toBeNull();
    player.toggle('cena', 4, 5);
    transport.advance(0);
    expect(player.state).toEqual({ key: 'cena', playing: true, paused: false });
    expect(heads[heads.length - 1]).toBe(4);
  });
});

describe('play — playRange direto (cliques de conta, L569/573)', () => {
  it('não seta key: cliques de conta não ganham affordance de pausa', () => {
    const { player, transport } = makePlayer();
    player.play(3, 7);
    transport.advance(0);
    expect(player.state).toEqual({ key: null, playing: true, paused: false });
  });

  it('conta única (s===e) toca pelo piso de 0.02s mesmo com conta mais curta', () => {
    // 1 conta de 0.01s: progresso encerra no fim da conta, mas o áudio (e o
    // state.playing) dura até o piso Math.max(0.02, t1-t0) da referência L645
    const decoded: DecodedAudio = {
      duration: 0.05,
      pcm: DECODED.pcm,
    };
    const transport = new FixtureTransport();
    const player = createPlayer(transport, decoded, 0.01);
    player.play(1, 1);
    advanceBy(transport, 0.015, 0.005);
    expect(player.state.playing).toBe(true); // ainda dentro do piso
    advanceBy(transport, 0.01, 0.005);
    expect(player.state.playing).toBe(false); // piso 0.02 vencido
  });

  it('interrompe playback anterior de outra origem (invariante de reprodução única)', () => {
    const { player, transport, heads } = makePlayer();
    player.toggle('a', 0, 9);
    advanceBy(transport, 0.3);
    player.play(8, 9);
    transport.advance(0);
    expect(player.state.key).toBeNull();
    heads.length = 0;
    // 0.3s cruza a fronteira da conta 8→9 (emissão é só-em-mudança)
    advanceBy(transport, 0.3);
    expect(heads.length).toBeGreaterThan(0);
    for (const h of heads) {
      expect(h).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('onHead — progresso (startProgress L614–624)', () => {
  it('emite índices monotônicos crescentes dentro de [s,e] e null no fim', () => {
    const { player, transport, heads } = makePlayer();
    player.toggle('cena', 2, 5);
    advanceBy(transport, 1.2, 0.02); // faixa de 1.0s + folga
    expect(heads[heads.length - 1]).toBeNull();
    const indices = heads.slice(0, -1);
    expect(indices.length).toBeGreaterThan(0);
    for (let i = 0; i < indices.length; i++) {
      const h = indices[i];
      expect(h).not.toBeNull();
      expect(h).toBeGreaterThanOrEqual(2);
      expect(h).toBeLessThanOrEqual(5);
      if (i > 0) expect(h!).toBeGreaterThan(indices[i - 1]!);
    }
    expect(indices[0]).toBe(2);
  });

  it('onended atrasado do nó descartado não derruba o playback novo (guard L646)', () => {
    const { player, transport, heads } = makePlayer();
    player.toggle('a', 0, 1);
    advanceBy(transport, 0.1);
    player.toggle('b', 4, 9); // descarta o nó de a; seu onended chega depois
    advanceBy(transport, 0.3);
    expect(player.state).toEqual({ key: 'b', playing: true, paused: false });
    expect(heads[heads.length - 1]).not.toBeNull();
  });

  it('unsubscribe para de receber emissões', () => {
    const transport = new FixtureTransport();
    const player = createPlayer(transport, DECODED, BEAD_SEC);
    const heads: (number | null)[] = [];
    const unsub = player.onHead((h) => heads.push(h));
    player.play(0, 9);
    advanceBy(transport, 0.3);
    const n = heads.length;
    unsub();
    advanceBy(transport, 0.3);
    expect(heads.length).toBe(n);
  });
});

describe('grade com conta parcial (§6.1)', () => {
  it('toca até a última conta parcial e termina na duração real', () => {
    // 2.6s / 0.25s = 10 contas cheias + 1 parcial (2.5–2.6s) ⇒ 11 contas
    const decoded: DecodedAudio = { duration: 2.6, pcm: DECODED.pcm };
    const transport = new FixtureTransport();
    const player = createPlayer(transport, decoded, BEAD_SEC);
    const heads: (number | null)[] = [];
    player.onHead((h) => heads.push(h));
    player.toggle('all', 0, 10);
    advanceBy(transport, 2.7, 0.02);
    expect(heads[heads.length - 1]).toBeNull(); // terminou
    expect(heads[heads.length - 2]).toBe(10); // alcançou a conta parcial
    expect(player.state.playing).toBe(false);
  });
});

describe('stop — stopPlayback (L639)', () => {
  it('limpa o state e emite head null', () => {
    const { player, transport, heads } = makePlayer();
    player.toggle('cena', 0, 9);
    advanceBy(transport, 0.4);
    player.stop();
    expect(player.state).toEqual({ key: null, playing: false, paused: false });
    expect(heads[heads.length - 1]).toBeNull();
  });

  it('stop durante pausa: o próximo play resume o transport e o progresso volta', () => {
    const { player, transport, heads } = makePlayer();
    player.toggle('cena', 0, 9);
    advanceBy(transport, 0.4);
    player.toggle('cena', 0, 9); // pausa (suspende)
    player.stop();
    expect(player.state).toEqual({ key: null, playing: false, paused: false });
    // sem play, o tempo suspenso não anda — e o próximo play resume incondicional
    player.play(0, 3);
    heads.length = 0;
    advanceBy(transport, 0.3);
    expect(heads.length).toBeGreaterThan(0);
    expect(heads[heads.length - 1]).not.toBeNull();
  });

  it('stop sem nada tocando é inofensivo', () => {
    const { player } = makePlayer();
    expect(() => player.stop()).not.toThrow();
    expect(player.state).toEqual({ key: null, playing: false, paused: false });
  });

  it('span fora da grade falha descritivo (não TypeError) — grade tem 10 contas', () => {
    const { player } = makePlayer();
    expect(() => player.play(0, 10)).toThrow(/fora da grade/);
  });
});

describe('playEdge / edgeWindow — janela de borda (§8.2; playEdge L600–605)', () => {
  it('edgeWindow: max(1, round(1/beadSec)) contas por lado', () => {
    expect(edgeWindow(10, 0.25, 100)).toEqual({ s: 6, e: 14 }); // half = 4
    expect(edgeWindow(10, 2, 100)).toEqual({ s: 9, e: 11 }); // round(0.5)=1 → min 1
    expect(edgeWindow(10, 0.3, 100)).toEqual({ s: 7, e: 13 }); // round(3.33)=3
  });

  it('edgeWindow clampa nas extremidades da grade', () => {
    expect(edgeWindow(1, 0.25, 100)).toEqual({ s: 0, e: 5 });
    expect(edgeWindow(98, 0.25, 100)).toEqual({ s: 94, e: 99 });
  });

  it('playEdge toca a janela em torno da fronteira, sem key', () => {
    const { player, transport, heads } = makePlayer();
    player.playEdge(5); // half = 4 → [1, 9]
    transport.advance(0);
    expect(player.state).toEqual({ key: null, playing: true, paused: false });
    expect(heads[heads.length - 1]).toBe(1);
  });

  it('playEdge clampa na extremidade da grade (fronteira na conta 0 começa em 0)', () => {
    const { player, transport, heads } = makePlayer();
    player.playEdge(0); // half = 4 → [0, 4]
    transport.advance(0);
    expect(heads[heads.length - 1]).toBe(0);
  });
});
