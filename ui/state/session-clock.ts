import { useEffect } from 'react';

/**
 * O relógio LÍQUIDO da sessão: quanto tempo de trabalho a sessão custou.
 *
 * "Líquido" não estava definido em lugar nenhum (nem no PRD v2, nem no plano de
 * MVP), então esta é a leitura mais simples que se sustenta: tempo com a sessão
 * ABERTA e a aba À VISTA, descontado qualquer intervalo maior que `IDLE_GAP_MS`
 * entre um pulso e o seguinte. É esse desconto que separa "líquido" de "corrido":
 * fechar a aba, trocar de janela por meia hora, a máquina dormir ou o dia virar
 * não viram tempo de trabalho.
 *
 * Deliberadamente NÃO se mede atividade de quem ouve (teclas, cliques, mouse):
 * o CLAUDE.md proíbe telemetria de comportamento do ouvinte, e uma facilitadora
 * que passa dez minutos escutando um áudio sem tocar em nada está trabalhando.
 * Estar com a sessão aberta e à vista É o sinal.
 *
 * Fica no browser e só nele: `localStorage`, chave versionada e namespaced (o
 * precedente é o tutorial-popup), com todo acesso em try/catch — armazenamento
 * bloqueado degrada para "o relógio vale enquanto a aba viver", nunca quebra a
 * tela. Nada disto vai para a rede, e nada disto entra em artefato: o contrato
 * dos três documentos não tem campo de tempo e não é aqui que ele ganharia um.
 */

/** Chave versionada — mesmo padrão do tutorial-popup e do idioma. */
const STORAGE_KEY = 'colar-de-sons:session-clock:v1';

/**
 * Intervalo a partir do qual um silêncio deixa de ser trabalho e vira pausa.
 * Cinco minutos: longo o bastante para não punir quem escuta um trecho inteiro
 * sem tocar em nada, curto o bastante para que um almoço não entre na conta.
 */
export const IDLE_GAP_MS = 5 * 60_000;

/** Passo do pulso. Curto o bastante para que fechar a aba custe pouco. */
export const TICK_MS = 15_000;

export interface ClockRecord {
  /** Tempo de trabalho acumulado, em ms. */
  netMs: number;
  /** Instante do último pulso — a outra ponta do intervalo que se mede. */
  lastTickMs: number;
  /** Sessão concluída: o número parou e não pode escorregar na tela de conclusão. */
  frozen: boolean;
}

const ZERO: ClockRecord = { netMs: 0, lastTickMs: 0, frozen: false };

type ClockMap = Record<string, ClockRecord>;

function readAll(): ClockMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ClockMap) : {};
  } catch {
    // armazenamento bloqueado ou conteúdo adulterado: o relógio começa do zero,
    // que é pior que o número certo e muito melhor que uma tela que não abre
    return {};
  }
}

function writeAll(map: ClockMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // sem armazenamento o relógio vale só enquanto a aba viver — nunca quebra
  }
}

function sane(rec: Partial<ClockRecord> | undefined): ClockRecord {
  if (!rec) return ZERO;
  return {
    netMs: typeof rec.netMs === 'number' && rec.netMs >= 0 ? rec.netMs : 0,
    lastTickMs: typeof rec.lastTickMs === 'number' ? rec.lastTickMs : 0,
    frozen: rec.frozen === true,
  };
}

/** O relógio desta sessão, como está guardado. */
export function readClock(sessionId: string): ClockRecord {
  return sane(readAll()[sessionId]);
}

function write(sessionId: string, rec: ClockRecord): void {
  const map = readAll();
  map[sessionId] = rec;
  writeAll(map);
}

/**
 * Um pulso: soma o intervalo desde o pulso anterior, se ele for curto o bastante
 * para ter sido trabalho. Puro — é aqui que mora a regra inteira.
 */
export function tick(rec: ClockRecord, nowMs: number, gapMs: number = IDLE_GAP_MS): ClockRecord {
  if (rec.frozen) return rec;
  const delta = nowMs - rec.lastTickMs;
  const counted = delta > 0 && delta <= gapMs ? delta : 0;
  return { ...rec, netMs: rec.netMs + counted, lastTickMs: nowMs };
}

/**
 * Abre o relógio: marco zero do intervalo, sem contar nada retroativo. Abrir uma
 * sessão de ontem não pode faturar a noite inteira.
 */
export function startClock(sessionId: string, nowMs: number): void {
  const rec = readClock(sessionId);
  write(sessionId, { ...rec, lastTickMs: nowMs });
}

/** Sinal de vida: o intervalo desde o anterior entra na conta (ou é descartado). */
export function markActivity(sessionId: string, nowMs: number): void {
  write(sessionId, tick(readClock(sessionId), nowMs));
}

/** Concluir congela: devolve o total que a tela de conclusão vai mostrar. */
export function freezeClock(sessionId: string): number {
  const rec = readClock(sessionId);
  write(sessionId, { ...rec, frozen: true });
  return rec.netMs;
}

/** Destravar para editar volta a contar — do instante em que se destravou. */
export function resumeClock(sessionId: string, nowMs: number): void {
  const rec = readClock(sessionId);
  write(sessionId, { ...rec, frozen: false, lastTickMs: nowMs });
}

/** Horas e minutos cheios — nunca arredonda para cima: o tempo não se infla. */
export function netTimeParts(ms: number): { hours: number; minutes: number } {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/**
 * O pulso da sessão aberta. Mora no shell, que é quem sabe qual sessão está
 * aberta; sem sessão não há relógio. A aba escondida não pulsa — e é justamente
 * o buraco que ela deixa que a regra do `IDLE_GAP_MS` transforma em pausa.
 */
export function useSessionClock(sessionId: string | null): void {
  useEffect(() => {
    if (!sessionId) return;
    startClock(sessionId, Date.now());
    const beat = (): void => {
      if (document.visibilityState !== 'visible') return;
      markActivity(sessionId, Date.now());
    };
    const timer = setInterval(beat, TICK_MS);
    // voltar para a aba fecha o intervalo aberto na saída antes do próximo passo
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [sessionId]);
}
