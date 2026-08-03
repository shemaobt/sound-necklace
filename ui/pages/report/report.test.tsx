import { act, render, screen, waitFor, within } from '@testing-library/react';
import baseCss from '../../tokens/base.css?raw';
import reportCss from './report.css?raw';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Transcriber } from '../../../adapters/stt/types';
import { FixtureVoiceRecorder } from '../../../adapters/voice/fixture';
import type { VoiceRecorder } from '../../../adapters/voice/types';
import { buildMapReport, type ResourcePath } from '../../../contracts';
import {
  buildBeads,
  createSession,
  ensureMapping,
  type Frase,
  L1_Q,
  type ScenePart,
  setAnswer,
  type SessionState,
  type Span,
  voiceAnswerPath,
} from '../../../domain';
import { sessionStore } from '../../state';
import Report from './index';

/**
 * A estação Relatório (PRD v2 §8.7, redesign §6.6): o artefato consolidado e
 * EDITÁVEL — um cartão por pergunta (na ordem de `questionSequence`), com a
 * resposta digitada editável, a linha de voz (▶ + forma de onda + duração) quando
 * a resposta é uma gravação, o vazio "ainda sem resposta gravada", o marcador de
 * papel das perguntas conduzidas e a nota opcional da facilitadora. Exporta o
 * `.md` pelo builder de contracts (byte-idêntico) e a nota NUNCA sai no `.md`.
 */

const DURATION = 7.5;
const BEAD_SEC = 0.25;

function part(overrides: Partial<ScenePart>): ScenePart {
  return {
    part_id: 'PT1',
    span: null,
    locked: false,
    scene_kind: null,
    scene_kind_confidence: null,
    tag_state: 'pending',
    ...overrides,
  };
}

function tagged(id: string, span: Span, kind = 'BIRTH_SCENE'): ScenePart {
  return part({
    part_id: id,
    span,
    locked: true,
    scene_kind: kind,
    scene_kind_confidence: 'high',
    tag_state: 'tagged',
  });
}

function frase(overrides: Partial<Frase>): Frase {
  return {
    prop_id: 'P1',
    statement: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
    ...overrides,
  };
}

/** Sessão em Conversation com o answer store garantido: 1 cena tagged, 2 frases. */
function report(overrides: Partial<SessionState> = {}): SessionState {
  const base = createSession({
    durationSec: DURATION,
    beadSec: BEAD_SEC,
    beads: buildBeads(DURATION, BEAD_SEC),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  const state: SessionState = {
    ...base,
    whole: { ...base.whole, confirmed: true },
    partsConfirmed: true,
    mode: 'mapeamento',
    parts: [tagged('PT1', { s: 2, e: 8 })],
    frases: [frase({ prop_id: 'P1', span: { s: 2, e: 4 }, part_link: 'PT1', locked: true })],
    ...overrides,
  };
  return ensureMapping(state);
}

function load(state: SessionState): void {
  sessionStore.getState().load(state);
}

/** Semeia uma gravação no caminho da resposta (has(path) → true), com ~9 s de
 *  duração no relógio falso do fixture (90 quadros × 0,1 s) para a linha de voz. */
async function seedVoice(recorder: FixtureVoiceRecorder, path: string): Promise<void> {
  const rec = await recorder.start(path);
  for (let i = 0; i < 90; i += 1) rec.tick();
  await rec.stop();
}

/** O cartão que contém o texto exato da pergunta. */
function cardFor(q: string): HTMLElement {
  const card = screen.getByText(q).closest('.cds-report-card');
  if (!card) throw new Error(`sem cartão para: ${q}`);
  return card as HTMLElement;
}

/**
 * Recorder com `has()` controlado por caminho: os listados resolvem já; os demais
 * ficam pendurados para sempre — é o que prova que uma resposta NÃO espera as
 * outras (a barreira do Promise.all seguraria tudo).
 */
function controllableRecorder(known: Record<string, boolean>): VoiceRecorder {
  return {
    start: () => Promise.reject(new Error('não usado neste teste')),
    play: () => Promise.resolve(),
    duration: () => Promise.resolve(9),
    stopPlayback: () => {},
    has: (p: ResourcePath) =>
      p in known ? Promise.resolve(known[p]!) : new Promise<boolean>(() => {}),
    delete: () => Promise.resolve(),
    onPlayback: () => () => {},
  };
}

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});

describe('Relatório — reprodução com cara de reprodução (ENG-323)', () => {
  it('clicar em ouvir mostra "abrindo…" até o som começar; tocando vira pausar; pausar volta', async () => {
    const q = L1_Q[0]!;
    const path = voiceAnswerPath({ level: 1, k: q.k });
    let emit: ((p: string | null) => void) | null = null;
    let releasePlay: (() => void) | null = null;
    const recorder: VoiceRecorder = {
      start: () => Promise.reject(new Error('não usado')),
      play: () =>
        new Promise((res) => {
          releasePlay = () => {
            emit?.(path);
            res();
          };
        }),
      duration: () => Promise.resolve(9),
      stopPlayback: () => emit?.(null),
      has: () => Promise.resolve(true),
      delete: () => Promise.resolve(),
      onPlayback: (cb) => {
        emit = cb;
        return () => {
          emit = null;
        };
      },
    };
    load(report());
    render(<Report recorder={recorder} />);

    const card = cardFor(q.q);
    await userEvent.click(await within(card).findByRole('button', { name: /ouvir a resposta/ }));
    // entre o toque e o som: o botão diz que está abrindo, sem aceitar clique
    const opening = within(card).getByRole('button', { name: /abrindo a resposta/ });
    expect((opening as HTMLButtonElement).disabled).toBe(true);

    await act(async () => releasePlay?.());
    // tocando: pausar + ondas acesas
    await userEvent.click(within(card).getByRole('button', { name: /pausar a resposta/ }));
    // pausado: volta ao ouvir
    expect(within(card).getByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();
  });
});

describe('Relatório — a voz aparece conforme cada resposta resolve (ENG-319)', () => {
  it('uma resposta verificada aparece mesmo com outra verificação ainda no ar', async () => {
    const fastQ = L1_Q[0]!;
    const fastPath = voiceAnswerPath({ level: 1, k: fastQ.k });
    const recorder = controllableRecorder({ [fastPath]: true }); // as demais nunca resolvem

    load(report());
    render(<Report recorder={recorder} />);

    const card = cardFor(fastQ.q);
    expect(await within(card).findByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();
  });

  it('enquanto a verificação voa, o cartão mostra "procurando", não "sem resposta"', () => {
    const pendingQ = L1_Q[1]!;
    const recorder = controllableRecorder({}); // nada resolve
    load(report());
    render(<Report recorder={recorder} />);

    const card = cardFor(pendingQ.q);
    expect(within(card).getByLabelText('procurando a resposta gravada')).toBeTruthy();
    expect(within(card).queryByPlaceholderText('ainda sem resposta gravada')).toBeNull();
  });

  it('descoberta pré-carregada abre a linha pronta, sem "procurando" (ENG-337)', () => {
    const knownQ = L1_Q[0]!;
    const knownPath = voiceAnswerPath({ level: 1, k: knownQ.k });
    const emptyQ = L1_Q[1]!;
    const emptyPath = voiceAnswerPath({ level: 1, k: emptyQ.k });
    const recorder = controllableRecorder({}); // nada resolve por conta própria

    load(report());
    render(
      <Report
        recorder={recorder}
        preloaded={{ checked: new Set([knownPath, emptyPath]), has: new Set([knownPath]) }}
      />,
    );

    // com gravação conhecida: a linha de voz já está lá, sem espera
    const known = cardFor(knownQ.q);
    expect(within(known).getByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();
    expect(within(known).queryByLabelText('procurando a resposta gravada')).toBeNull();
    // conhecida SEM gravação: o vazio normal, também sem espera
    const empty = cardFor(emptyQ.q);
    expect(within(empty).getByPlaceholderText('ainda sem resposta gravada')).toBeTruthy();
    expect(within(empty).queryByLabelText('procurando a resposta gravada')).toBeNull();
  });

  it('verificada SEM gravação perde o "procurando" e volta ao vazio normal', async () => {
    const q = L1_Q[2]!;
    const path = voiceAnswerPath({ level: 1, k: q.k });
    const recorder = controllableRecorder({ [path]: false });
    load(report());
    render(<Report recorder={recorder} />);

    const card = cardFor(q.q);
    expect(await within(card).findByPlaceholderText('ainda sem resposta gravada')).toBeTruthy();
    expect(within(card).queryByLabelText('procurando a resposta gravada')).toBeNull();
  });
});

describe('Relatório — cabeçalho do protótipo (redesign §6.6)', () => {
  it('mostra o cabeçalho do protótipo (eyebrow + manchete serifada)', () => {
    load(report());
    render(<Report />);

    expect(screen.getByText('A conversa sobre o sentido')).toBeTruthy();
    expect(screen.getByText('Tudo que vocês falaram, reunido.')).toBeTruthy();
  });
});

describe('Relatório — renderização por tipo de resposta (redesign §6.6)', () => {
  it('digitada mostra texto editável; só-voz mostra a linha de voz; vazia mostra "ainda sem resposta gravada"; conduzida traz o marcador de papel', async () => {
    const typedQ = L1_Q[0]!; // recontar
    const voiceQ = L1_Q[1]!; // arco_inicio_fim
    const emptyQ = L1_Q[2]!; // arco_muda
    const ledQ = L1_Q[10]!; // ausencia (conduzida pela facilitadora)

    const recorder = new FixtureVoiceRecorder();
    const voicePath = voiceAnswerPath({ level: 1, k: voiceQ.k });
    await seedVoice(recorder, voicePath);

    load(setAnswer(report(), { level: 1, k: typedQ.k }, 'era uma vez'));
    render(<Report recorder={recorder} />);

    // só-voz: ▶ ouvir a resposta + forma de onda + duração (resolvido assíncrono via has())
    const voiceCard = cardFor(voiceQ.q);
    expect(await within(voiceCard).findByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();
    expect(voiceCard.querySelectorAll('.cds-waveform-bar').length).toBeGreaterThan(0);
    const duration = await within(voiceCard).findByLabelText('duração da resposta');
    expect(duration.textContent).toMatch(/^\d+:\d{2}$/); // duração real formatada, não "—"
    expect(duration.textContent).not.toBe('—');

    // digitada: textarea editável com o valor
    const typedCard = cardFor(typedQ.q);
    expect((within(typedCard).getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'era uma vez',
    );

    // vazia: estado "ainda sem resposta gravada"
    const emptyCard = cardFor(emptyQ.q);
    expect(within(emptyCard).getByPlaceholderText('ainda sem resposta gravada')).toBeTruthy();

    // conduzida pela facilitadora: marcador de papel
    const ledCard = cardFor(ledQ.q);
    expect(within(ledCard).getByRole('img', { name: 'conduzida pela facilitadora' })).toBeTruthy();
  });

  it('a gravação continua audível depois que a resposta tem texto (ENG-368)', async () => {
    const q = L1_Q[1]!; // arco_inicio_fim
    const recorder = new FixtureVoiceRecorder();
    await seedVoice(recorder, voiceAnswerPath({ level: 1, k: q.k }));

    // texto confirmado E gravação: a voz é a PROCEDÊNCIA da célula, e é justamente ao
    // conferir o texto que se quer reouvir. Some o player, some o único jeito de checar.
    load(setAnswer(report(), { level: 1, k: q.k }, 'era uma vez'));
    render(<Report recorder={recorder} />);

    const card = cardFor(q.q);
    expect(await within(card).findByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();
    expect(card.querySelectorAll('.cds-waveform-bar').length).toBeGreaterThan(0);
    expect((within(card).getByRole('textbox') as HTMLTextAreaElement).value).toBe('era uma vez');
  });
});

describe('Relatório — edição e nota da facilitadora (PRD v2 §8.7, §10.4)', () => {
  /**
   * ENG-369: digitar não chega mais ao answer store sozinho. O texto fica em estado
   * local até alguém ACEITAR — é isso que dá a "descartar" algo a que voltar. Os três
   * testes abaixo cobrem o caminho inteiro: escrever, desistir, e confirmar.
   */
  it('digitar sozinho NÃO toca o answer store — aceitar é que escreve', async () => {
    const q = L1_Q[0]!;
    load(report());
    render(<Report />);

    const card = cardFor(q.q);
    await userEvent.type(within(card).getByRole('textbox'), 'resposta nova');
    expect(sessionStore.getState().session!.mapping?.level1[q.k] ?? '').toBe('');

    await userEvent.click(within(card).getByRole('button', { name: 'aceitar a edição' }));
    expect(sessionStore.getState().session!.mapping!.level1[q.k]).toBe('resposta nova');
  });

  it('descartar devolve o campo ao que estava, sem tocar o store', async () => {
    const q = L1_Q[0]!;
    load(setAnswer(report(), { level: 1, k: q.k }, 'era uma vez'));
    render(<Report />);

    const card = cardFor(q.q);
    const field = within(card).getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.clear(field);
    await userEvent.type(field, 'texto que vou desistir');

    await userEvent.click(within(card).getByRole('button', { name: 'descartar a edição' }));

    expect((within(card).getByRole('textbox') as HTMLTextAreaElement).value).toBe('era uma vez');
    expect(sessionStore.getState().session!.mapping!.level1[q.k]).toBe('era uma vez');
  });

  it('em repouso oferece o lápis; em edição, descartar e aceitar', async () => {
    const q = L1_Q[0]!;
    load(report());
    render(<Report />);

    const card = cardFor(q.q);
    expect(within(card).getByRole('button', { name: 'editar a resposta' })).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'aceitar a edição' })).toBeNull();

    await userEvent.type(within(card).getByRole('textbox'), 'x');

    expect(within(card).queryByRole('button', { name: 'editar a resposta' })).toBeNull();
    expect(within(card).getByRole('button', { name: 'descartar a edição' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'aceitar a edição' })).toBeTruthy();
  });

  it('a nota persiste no estado da sessão (relida no re-mount) e NÃO sai no .md exportado', async () => {
    const q = L1_Q[0]!;
    load(report());
    const view = render(<Report />);

    const before = buildMapReport(sessionStore.getState().session!);

    const card = cardFor(q.q);
    await userEvent.click(within(card).getByRole('button', { name: 'acrescentar uma observação' }));
    await userEvent.type(
      within(card).getByLabelText('observação da facilitadora'),
      'checar vocabulário',
    );

    // a nota volta a aparecer num re-mount → está no estado da sessão (blackbox)
    view.unmount();
    render(<Report />);
    expect(
      (within(cardFor(q.q)).getByLabelText('observação da facilitadora') as HTMLTextAreaElement)
        .value,
    ).toBe('checar vocabulário');

    // o .md é byte-idêntico ao de antes da nota e não a contém
    const after = buildMapReport(sessionStore.getState().session!);
    expect(after).toBe(before);
    expect(after).not.toContain('checar vocabulário');
  });
});

describe('Relatório — rascunhos de transcrição e tradução (ENG-327)', () => {
  /** Transcriber controlável: `resolve()` entrega os rascunhos quando o teste quiser. */
  function controllableStt(drafts: Record<string, { source: string; en: string }>): {
    stt: Transcriber;
    finish: () => void;
    started: string[][];
  } {
    const started: string[][] = [];
    let release: (() => void) | null = null;
    // o job só termina quando o TESTE mandar: `progress` espera esta promessa, então
    // nenhum caso depende da ordem dos microtasks nem do atraso real do polling
    const gate = new Promise<void>((res) => {
      release = res;
    });
    let settled = false;
    void gate.then(() => {
      settled = true;
    });
    return {
      started,
      finish: () => release?.(),
      stt: {
        start: (_id, paths) => {
          started.push([...paths]);
          return Promise.resolve();
        },
        progress: async () => {
          await Promise.resolve();
          return settled ? { done: true, drafts } : { done: false, drafts: {} };
        },
      },
    };
  }

  const Q = L1_Q[0]!;
  const PATH = voiceAnswerPath({ level: 1, k: Q.k });
  const DRAFTS = { [PATH]: { source: 'Ele contou do boto.', en: 'He told of the dolphin.' } };

  /**
   * ENG-367: a espera virou a TELA. Antes cada um dos 41 cartões dizia "transcrevendo"
   * e a revisão já estava lá para ser mexida enquanto o texto ainda ia mudar.
   */
  it('enquanto o job roda, a tela é a espera — nenhum cartão para mexer', async () => {
    const { stt } = controllableStt(DRAFTS);
    load(report());
    const view = render(
      <Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />,
    );

    await screen.findByText(/transcrevendo/i);
    expect(view.container.querySelectorAll('.cds-report-card')).toHaveLength(0);
    expect(screen.queryByLabelText('resposta')).toBeNull();
    // a região live continua montada e vazia: criada junto com o conteúdo, não seria
    // anunciada quando os rascunhos chegassem
    expect(view.container.querySelector('.cds-report-drafts-live')).not.toBeNull();
  });

  it('o rascunho chega marcado como sugestão, e ainda NÃO é a resposta', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    render(<Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />);

    finish();
    // o que se revisa é o TRANSCRIPT, na língua falada (ENG-370)
    const src = await screen.findByDisplayValue('Ele contou do boto.');

    const card = src.closest('.cds-report-card') as HTMLElement;
    expect(within(card).getByText(/sugestão/i)).toBeTruthy();
    // nada disto virou resposta ainda: o .md não traz nem o transcript nem o inglês
    const md = buildMapReport(sessionStore.getState().session!);
    expect(md).not.toContain('He told of the dolphin.');
    expect(md).not.toContain('Ele contou do boto.');
  });

  it('confirmar põe o TRANSCRIPT na resposta — e o .md sai em inglês (ENG-370)', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    render(<Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />);

    finish();
    const src = await screen.findByDisplayValue('Ele contou do boto.');
    const card = src.closest('.cds-report-card') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: /confirmar/i }));

    // a TELA fica na língua falada…
    expect((within(card).getByLabelText('resposta') as HTMLTextAreaElement).value).toBe(
      'Ele contou do boto.',
    );
    // …e o ARTEFATO, em inglês
    const md = buildMapReport(sessionStore.getState().session!);
    expect(md).toContain('He told of the dolphin.');
    expect(md).not.toContain('Ele contou do boto.');
  });

  it('corrigir o transcript antes de confirmar guarda o texto corrigido', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    render(<Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />);

    finish();
    const src = await screen.findByDisplayValue('Ele contou do boto.');
    await userEvent.clear(src);
    await userEvent.type(src, 'Ele falou do boto-cor-de-rosa.');

    const card = src.closest('.cds-report-card') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: /confirmar/i }));

    expect((within(card).getByLabelText('resposta') as HTMLTextAreaElement).value).toBe(
      'Ele falou do boto-cor-de-rosa.',
    );
  });

  it('apagar o transcript de propósito o mantém apagado ao remontar', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    const view = render(
      <Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />,
    );

    finish();
    const src = await screen.findByDisplayValue('Ele contou do boto.');
    await userEvent.clear(src);

    view.unmount();
    const again = controllableStt(DRAFTS);
    again.finish();
    const remount = render(
      <Report recorder={controllableRecorder({ [PATH]: true })} stt={again.stt} sessionId="s-1" />,
    );

    // o rascunho NÃO ressuscita: a pessoa já o recusou
    const scope = within(remount.container);
    const field = (await scope.findByLabelText(/o que se ouviu/i)) as HTMLTextAreaElement;
    expect(field.value).toBe(''); // o rascunho NÃO ressuscita: a pessoa já o recusou
  });

  it('regravar a resposta substitui o rascunho obsoleto', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    const view = render(
      <Report
        recorder={controllableRecorder({ [PATH]: true })}
        stt={stt}
        sessionId="s-1"
        recordingVersion={{ [PATH]: 1 }}
      />,
    );
    finish();
    await screen.findByDisplayValue('Ele contou do boto.');
    view.unmount();

    // a pessoa voltou, regravou (versão 2) e o job devolve outra tradução
    const novo = controllableStt({
      [PATH]: { source: 'Ele contou de novo.', en: 'He told it again.' },
    });
    novo.finish();
    render(
      <Report
        recorder={controllableRecorder({ [PATH]: true })}
        stt={novo.stt}
        sessionId="s-1"
        recordingVersion={{ [PATH]: 2 }}
      />,
    );

    // confirmar não pode escrever o transcript de um áudio descartado
    await screen.findByDisplayValue('Ele contou de novo.');
    expect(screen.queryByDisplayValue('Ele contou do boto.')).toBeNull();
  });

  it('uma pergunta sem gravação nunca ganha rascunho', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    const outra = L1_Q[1]!;
    load(report());
    render(<Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />);

    finish();
    await screen.findByDisplayValue('Ele contou do boto.');

    const card = cardFor(outra.q);
    expect(within(card).queryByText(/sugestão/i)).toBeNull();
    expect(within(card).queryByRole('button', { name: /confirmar/i })).toBeNull();
  });

  it('só pede transcrição das respostas que TÊM gravação', async () => {
    const { stt, started } = controllableStt(DRAFTS);
    load(report());
    render(<Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />);

    // esperar o rótulo "transcrevendo" não serve aqui: ele aparece antes de `start`
    // ser chamado, e num runner lento a asserção corria antes do pedido sair
    await waitFor(() => expect(started.flat()).toEqual([PATH]));
  });

  it('a chegada dos rascunhos é anunciada por uma região registrada vazia de antemão', async () => {
    const { stt, finish } = controllableStt(DRAFTS);
    load(report());
    render(<Report recorder={controllableRecorder({ [PATH]: true })} stt={stt} sessionId="s-1" />);

    // registrada ANTES de ter conteúdo, senão o leitor de tela não anuncia nada
    const region = screen.getByRole('status', { name: /rascunho/i });
    expect(region.textContent).toBe('');

    finish();
    await screen.findByDisplayValue('Ele contou do boto.');
    // e o que se anuncia é o RESUMO, não o rascunho inteiro
    expect(region.textContent).toMatch(/1 resposta para revisar/i);
    expect(region.textContent).not.toContain('He told of the dolphin.');
  });
});

/**
 * ENG-372: o foco global (base.css) desenha um retângulo telha de 3px afastado 3px.
 * Num campo transparente de largura total isso vira uma caixa que briga com a linha
 * quieta que o campo é. Aqui o indicador troca de FORMA, não de força — e o teste
 * existe para que ninguém o apague junto com o outline.
 */
describe('Relatório — foco do campo de resposta (ENG-372)', () => {
  const rule =
    /\.cds-report-typed:focus-visible,\s*\.cds-report-note:focus-visible\s*{[^}]*}/.exec(
      reportCss,
    )?.[0] ?? '';

  it('abre mão do retângulo global', () => {
    expect(rule).toContain('outline: none');
  });

  it('mas mantém um indicador de foco visível — geometria E cor, não só cor', () => {
    // o filete da esquerda engrossa E vira telha: quem não distingue cor ainda vê a mudança
    expect(rule).toContain('border-left-width: 3px');
    expect(rule).toContain('var(--cds-telha)');
  });

  it('não mexe na regra global de foco', () => {
    expect(baseCss).toContain('outline: 3px solid var(--cds-telha)');
  });
});
