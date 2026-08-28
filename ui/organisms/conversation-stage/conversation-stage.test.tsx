import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { splitByGuard } from '../../atoms/testing/css';
import type { ConversationTrecho } from '../../molecules';
import { ConversationStage, type ConversationStageProps } from './conversation-stage';
import stageCss from './conversation-stage.css?raw';

const tint = (base: string) => ({ base, lit: base, deep: base });
const TRECHOS: ConversationTrecho[] = [
  { count: 11, color: tint('#a9a06a'), label: 'A história' },
  { count: 5, color: tint('#be4a01'), label: 'Chegada' },
];

function baseProps(over: Partial<ConversationStageProps> = {}): ConversationStageProps {
  return {
    question: 'O que aconteceu nesta parte da história?',
    recorderState: 'idle',
    progress: { total: 4, current: 1 },
    trechos: [{ count: 4, color: tint('#a9a06a'), label: 'A história' }],
    ...over,
  };
}

/**
 * Marcador de papel (§8.7): perguntas conduzidas pela facilitadora carregam um
 * glifo SEM palavras ("nunca preencha por conta própria") — distingue papel sem
 * texto.
 */
describe('ConversationStage — marcador de papel (§8.7)', () => {
  it('quando facilitatorLed, mostra o glifo sem nenhuma linha de texto', () => {
    render(<ConversationStage {...baseProps({ facilitatorLed: true })} />);
    const marker = screen.getByRole('img', { name: 'conduzida pela facilitadora' });
    expect(marker.textContent).toBe('');
  });

  it('sem facilitatorLed, não há marcador', () => {
    render(<ConversationStage {...baseProps({ facilitatorLed: false })} />);
    expect(screen.queryByRole('img', { name: 'conduzida pela facilitadora' })).toBeNull();
  });
});

/** Reproduzindo a resposta gravada: ouvir ⇄ pausar + as barras acesas (ENG-322). */
describe('ConversationStage — feedback de reprodução da resposta (ENG-322)', () => {
  it("tocando, 'Ouvir a resposta' vira 'Pausar' e a forma de onda acende", () => {
    const { container, rerender } = render(
      <ConversationStage
        {...baseProps({ recorderState: 'recorded', answerPlaying: true, onStopPlay: vi.fn() })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy();
    expect(
      container.querySelectorAll('.cds-waveform-bar[data-state="active"]').length,
    ).toBeGreaterThan(0);

    rerender(<ConversationStage {...baseProps({ recorderState: 'recorded' })} />);
    expect(screen.getByRole('button', { name: 'Ouvir a resposta' })).toBeTruthy();
    expect(container.querySelectorAll('.cds-waveform-bar[data-state="active"]').length).toBe(0);
  });
});

/**
 * Saber se a pergunta já tem resposta é uma ida à rede (`recorder.has`). Até ela
 * responder o palco caía no estado `idle`, ou seja, AFIRMAVA que não há resposta
 * — o convite "Toque e fale a sua resposta" e a promessa do fio de som, na
 * pergunta que já tinha uma gravada. `checking` é essa ignorância, desenhada.
 */
describe('ConversationStage — a procura pela resposta já gravada', () => {
  it("em 'checking', o esqueleto da onda substitui a promessa do fio de som", () => {
    const { container } = render(
      <ConversationStage {...baseProps({ recorderState: 'checking' })} />,
    );
    expect(container.querySelector('.cds-conversation-stage-wave-skeleton')).not.toBeNull();
    expect(container.querySelector('.cds-conversation-stage-empty-wave')).toBeNull();
  });

  it('a linha curta diz que está procurando, no lugar do convite a falar (§9.2: uma linha só)', () => {
    const { container } = render(
      <ConversationStage {...baseProps({ recorderState: 'checking' })} />,
    );
    expect(screen.getByText('Procurando a resposta já gravada')).toBeTruthy();
    expect(screen.queryByText('Toque e fale a sua resposta')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/\d/);
  });

  it('não oferece ouvir nem regravar antes de saber que existe resposta', () => {
    render(<ConversationStage {...baseProps({ recorderState: 'checking' })} />);
    expect(screen.queryByRole('button', { name: 'Ouvir a resposta' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gravar de novo' })).toBeNull();
  });

  it('a procura não trava o microfone: quem quer responder já pode', () => {
    render(<ConversationStage {...baseProps({ recorderState: 'checking' })} />);
    const mic = screen.getByRole('button', { name: 'Gravar a resposta' });
    expect((mic as HTMLButtonElement).disabled).toBe(false);
  });
});

/** Parar → guardar: o estado vive no botão (ENG-318) — spinner, desabilitado, sem texto novo. */
describe('ConversationStage — guardando a resposta (ENG-318)', () => {
  it("em 'saving', o microfone vira 'Guardando a resposta' e não aceita clique", () => {
    render(<ConversationStage {...baseProps({ recorderState: 'saving' })} />);
    const btn = screen.getByRole('button', { name: 'Guardando a resposta' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

/** O botão da pergunta segue o estado REAL da fala (ENG-317): falando ⇄ pausado. */
describe('ConversationStage — botão da pergunta pelo estado da fala (ENG-317)', () => {
  it('falando, oferece "Pausar a pergunta"; calado, "Ouvir a pergunta"', () => {
    const onSpeakQuestion = vi.fn();
    const { rerender } = render(
      <ConversationStage {...baseProps({ onSpeakQuestion, speaking: true })} />,
    );
    expect(screen.getByRole('button', { name: 'Pausar a pergunta' })).toBeTruthy();

    rerender(<ConversationStage {...baseProps({ onSpeakQuestion, speaking: false })} />);
    expect(screen.getByRole('button', { name: 'Ouvir a pergunta' })).toBeTruthy();
  });
});

/**
 * Barra de progresso por trecho (§8.7, ENG-350): substitui as contas por-pergunta
 * no rodapé — uma barra segmentada história · cenas · frases, com o marcador na
 * posição atual e a legenda do trecho, jamais um número (§9.2).
 */
describe('ConversationStage — barra de progresso por trecho (ENG-350)', () => {
  const footer = (el: HTMLElement) => el.querySelector('.cds-conversation-stage-progress')!;

  it('rende a barra por trecho no rodapé, com a legenda do trecho atual e sem dígitos', () => {
    const { container } = render(
      <ConversationStage
        {...baseProps({
          trechos: TRECHOS,
          progress: { total: 16, current: 3 },
        })}
      />,
    );
    const rodape = footer(container);
    expect(rodape.querySelector('.cds-conv-progress')).not.toBeNull();
    expect(rodape.querySelectorAll('.cds-conv-progress-seg')).toHaveLength(2);
    expect(rodape.querySelector('.cds-conv-progress-caption')?.textContent).toBe('A história');
    expect(rodape.textContent ?? '').not.toMatch(/\d/);
    // nenhuma conta do modelo antigo sobrou
    expect(rodape.querySelectorAll('.cds-pearl')).toHaveLength(0);
  });

  it('entrar numa cena troca a legenda — o marcador de transição de trecho', () => {
    const { container } = render(
      <ConversationStage
        {...baseProps({
          trechos: TRECHOS,
          progress: { total: 16, current: 13 },
        })}
      />,
    );
    expect(container.querySelector('.cds-conv-progress-caption')?.textContent).toBe('Chegada');
  });
});

/**
 * "Ouvir a pergunta" (§6.6): a afordância de fala só aparece quando há uma porta
 * de fala fornecida (TTS ausente antes da ENG-251 simplesmente esconde o botão).
 */
describe('ConversationStage — "Ouvir a pergunta" condicional', () => {
  it('rende o botão só quando onSpeakQuestion é fornecido', () => {
    const { rerender } = render(<ConversationStage {...baseProps()} />);
    expect(screen.queryByText('Ouvir a pergunta')).toBeNull();
    rerender(<ConversationStage {...baseProps({ onSpeakQuestion: vi.fn() })} />);
    expect(screen.getByText('Ouvir a pergunta')).toBeTruthy();
  });
});

/**
 * Entrevista só-voz (design parity): o palco do Conversation não tem canal
 * digitado — a digitação vive só no relatório (já editável, ver ui/pages/report).
 * A linha sobre a facilitadora escrever depois saiu na revisão de copy (ENG-603):
 * sob o microfone fica UMA linha (§9.2), e ela é o convite a falar.
 */
describe('ConversationStage — entrevista só-voz (design parity)', () => {
  it('sob o microfone fica só o convite a falar — nada sobre a facilitadora escrever depois', () => {
    const { container } = render(<ConversationStage {...baseProps({ recorderState: 'idle' })} />);

    const hint = container.querySelector('.cds-conversation-stage-hint')!;
    expect(hint.textContent).toBe('Toque e fale a sua resposta');
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('ConversationStage — convite e gravação por voz (protótipo §9.2)', () => {
  it('idle: convida a falar', () => {
    render(<ConversationStage {...baseProps({ recorderState: 'idle' })} />);
    expect(screen.getByText('Toque e fale a sua resposta')).toBeTruthy();
  });

  it('gravando: o botão redondo vira Parar e anuncia a gravação', () => {
    const { container } = render(
      <ConversationStage {...baseProps({ recorderState: 'recording' })} />,
    );
    const stopButton = screen.getByRole('button', { name: 'Parar' });
    expect(stopButton.classList.contains('cds-conversation-stage-mic')).toBe(true);
    expect(screen.getByText('Gravando — os outros botões esperam a resposta')).toBeTruthy();
    expect(container.textContent ?? '').not.toMatch(/\d/);
  });
});

/**
 * No rodapé, entre voltar e avançar, o "Sem resposta" ficava escondido: quem conduz
 * olha para o microfone, e é ali — no mesmo instante em que se decidiria gravar —
 * que se decide deixar a pergunta sem resposta.
 */
describe('ConversationStage — o "Sem resposta" mora junto do microfone', () => {
  it('fica na área do gravador, não no rodapé da navegação', () => {
    const { container } = render(<ConversationStage {...baseProps({ onToggleSkip: vi.fn() })} />);

    const skip = screen.getByRole('button', { name: 'Sem resposta' });
    expect(container.querySelector('.cds-conversation-stage-recorder')?.contains(skip)).toBe(true);
    expect(container.querySelector('.cds-conversation-stage-footer')?.contains(skip)).toBe(false);
  });

  it('o microfone segue sendo a ação dominante ao lado dele', () => {
    render(<ConversationStage {...baseProps({ onToggleSkip: vi.fn() })} />);

    const mic = screen.getByRole('button', { name: 'Gravar a resposta' });
    const skip = screen.getByRole('button', { name: 'Sem resposta' });
    expect(mic.classList.contains('cds-conversation-stage-mic')).toBe(true);
    expect(skip.classList.contains('cds-conversation-stage-mic')).toBe(false);
  });
});

describe('ConversationStage — movimento respeita prefers-reduced-motion (§4.5)', () => {
  it('nenhuma animação vive fora da guarda de movimento', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(stageCss, guard);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});

/**
 * A pílula do modo e a barra de espera (ENG-649). O organismo não decide nada
 * sobre modo — mas ele decide o que a tela mostra, e é aqui que a linha única do
 * §9.2 e a saída de emergência do mãos livres ou existem, ou não.
 */
describe('ConversationStage — a pílula do modo e a espera (ENG-649)', () => {
  const modo = () => screen.queryByRole('button', { name: /trocar$/ });

  it('sem modo escolhido a pílula não existe — ela DIZ o modo, e não teria o que dizer', () => {
    render(<ConversationStage {...baseProps()} />);
    expect(modo()).toBeNull();
  });

  it('a pílula nomeia o modo em que se está', () => {
    const { rerender } = render(
      <ConversationStage {...baseProps({ mode: 'auto', onToggleMode: vi.fn() })} />,
    );
    expect(modo()!.textContent).toContain('mãos livres');

    rerender(<ConversationStage {...baseProps({ mode: 'manual', onToggleMode: vi.fn() })} />);
    expect(modo()!.textContent).toContain('toque a toque');
  });

  /**
   * A gravação trava o palco inteiro (ENG-393) e NÃO trava esta. Em mãos livres o
   * microfone pode ter aberto sem ninguém pedir, e recusar a saída exatamente aí
   * faria da saída de emergência a única coisa fora de alcance quando ela importa.
   */
  it('gravando, a pílula continua funcionando — é a saída, e ela não estraga a gravação', async () => {
    const onToggleMode = vi.fn();
    const onBlocked = vi.fn();
    render(
      <ConversationStage
        {...baseProps({ recorderState: 'recording', mode: 'auto', onToggleMode, onBlocked })}
      />,
    );

    await userEvent.click(modo()!);

    expect(onToggleMode).toHaveBeenCalled();
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it('a espera toma o lugar do convite a falar — a tela do ouvinte tem UMA linha (§9.2)', () => {
    const { rerender } = render(
      <ConversationStage {...baseProps({ recorderState: 'recorded' })} />,
    );
    const linha = () => document.querySelector('.cds-conversation-stage-hint-strong')?.textContent;
    expect(linha()).toBe('Toque e fale a sua resposta');

    rerender(
      <ConversationStage {...baseProps({ recorderState: 'recorded', autoAdvancing: true })} />,
    );

    expect(linha()).toBe('a próxima chega num instante — o botão lá em cima segura o passo');
    expect(document.querySelectorAll('.cds-conversation-stage-hint-strong')).toHaveLength(1);
  });

  /**
   * A barra dura o que o relógio dura. Se o número fosse repetido no CSS, ela
   * encheria antes ou depois da pergunta chegar na primeira vez que alguém
   * ajustasse o outro — uma promessa visível quebrando em silêncio.
   */
  it('a barra da espera dura exatamente o que quem arma o relógio disse', () => {
    render(<ConversationStage {...baseProps({ autoAdvancing: true, autoAdvanceMs: 2600 })} />);
    const barra = document.querySelector<HTMLElement>('.cds-conversation-stage-countdown-run');
    expect(barra?.style.animationDuration).toBe('2600ms');
  });

  it('pedir para regravar avisa ANTES de abrir a confirmação — a conversa não anda por baixo', async () => {
    const onRerecordAsk = vi.fn();
    render(
      <ConversationStage
        {...baseProps({ recorderState: 'recorded', autoAdvancing: true, onRerecordAsk })}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Gravar de novo/ }));

    expect(onRerecordAsk).toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });
});
