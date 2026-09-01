import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import { FixtureAudioEngine } from '../../../adapters/audio';
import type { BucketSource } from '../../../adapters/bucket';
import { AcoustemeGranularityResolver } from '../../../adapters/granularity';
import { FixtureProjectSettings } from '../../../adapters/project-settings';
import { FixtureSessionStore } from '../../../adapters/sessions';
import type { BucketAudio } from '../../../contracts';
// as MESMAS folhas globais que ui/app/main.tsx carrega. Sem elas faltam os tokens
// --cds- e, principalmente, o `box-sizing: border-box` de base.css: o padding
// passaria a somar-se à altura da estação e a medição mediria uma tela inexistente.
import '../../tokens/base.css';
import '../../tokens/tokens.css';
import Setup from './index';

/**
 * ENG-386, em Chromium de verdade. jsdom não faz layout, então a asserção que
 * importa — "o botão de criar a sessão está NA TELA, com a entrega que for" — não
 * cabe lá: no projeto dom só dá para provar a forma da folha de estilo.
 *
 * Aqui a condição é medida. É este arquivo que teria pegado o defeito original (a
 * lista crescendo até empurrar o botão para fora) e é ele que pega a volta dela.
 *
 * A montagem repete a geometria de produção: o shell põe um cabeçalho de 64px acima
 * da estação e mais nada (o fio de contas só existe dentro de uma sessão), então o
 * espaçador de 64px é o que faz `100dvh - 64px` significar aqui o que significa lá.
 */

const CABECALHO_DO_SHELL = 64;

/** Entrega grande: é o tamanho que produzia o defeito no primeiro passeio real. */
function entregaCom(n: number): BucketAudio[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `aud_${i}`,
    filename: `historia-${String(i).padStart(2, '0')}.wav`,
    consent_present: i % 3 !== 0,
  }));
}

class EntregaGrande implements BucketSource {
  constructor(private readonly audios: BucketAudio[]) {}

  async list(): Promise<BucketAudio[]> {
    return this.audios.map((a) => ({ ...a }));
  }

  async fetchBytes(): Promise<ArrayBuffer> {
    throw new Error('a medição de layout não busca bytes');
  }
}

let montado: { root: Root; host: HTMLElement } | null = null;

/** Um teste pode medir mais de uma vez; a montagem anterior tem de sair do DOM. */
function desmontar(): void {
  if (!montado) return;
  const { root, host } = montado;
  montado = null;
  flushSync(() => root.unmount());
  host.remove();
}

afterEach(desmontar);

interface Medida {
  /** Quanto do botão sobra abaixo da borda de baixo da janela. 0 = inteiro na tela. */
  botaoForaDaTela: number;
  /** Quanto a PÁGINA precisaria rolar para mostrar tudo. 0 = a tela inteira coube. */
  paginaPrecisaRolar: number;
  /** A lista rola por dentro? É ela quem tem de ceder. */
  listaRolaPorDentro: boolean;
  /**
   * Área em que a janela da lista invade a coluna da ação. Tem de ser 0.
   *
   * Esta é a medida menos óbvia e a mais necessária. Uma corrente de altura frouxa
   * demais NÃO empurra o botão para fora da tela — ela deixa a COLUNA encolher
   * abaixo da própria janela, que então transborda por cima do que vem depois. O
   * botão continua na tela, a página continua sem rolar, e a tela fica ilegível
   * com todas as outras asserções verdes. Foi assim que este defeito passou:
   * apareceu numa captura de tela, não numa medida.
   *
   * Repare que comparar as duas COLUNAS não serve: as caixas delas ficam lado a
   * lado como manda o flex; quem invade é o conteúdo de uma.
   */
  listaInvadeAAcao: number;
}

/** Área da interseção de dois retângulos. 0 = não se tocam. */
function sobreposicao(a: DOMRect, b: DOMRect): number {
  const largura = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const altura = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (largura <= 0 || altura <= 0) return 0;
  return Math.round(largura * altura);
}

async function medir(largura: number, altura: number, quantosAudios: number): Promise<Medida> {
  desmontar();
  await page.viewport(largura, altura);

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  montado = { root, host };

  flushSync(() =>
    root.render(
      <>
        {/* o cabeçalho do shell, como pixel e não como suposição */}
        <div style={{ height: `${CABECALHO_DO_SHELL}px` }} />
        <Setup
          bucket={new EntregaGrande(entregaCom(quantosAudios))}
          resolver={new AcoustemeGranularityResolver()}
          audioEngine={new FixtureAudioEngine()}
          store={new FixtureSessionStore()}
          projectSettings={new FixtureProjectSettings({ seed: { projeto: { level: 'medium' } } })}
          canEdit={async () => true}
          navigate={vi.fn()}
        />
      </>,
    ),
  );

  // a listagem do bucket é assíncrona: espera a lista real substituir o esqueleto
  await vi.waitFor(() => {
    expect(document.querySelectorAll('.cds-setup-audio').length).toBe(quantosAudios);
  });

  const criar = document.querySelector<HTMLElement>('.cds-setup-create');
  expect(criar, 'não achei o botão de criar a sessão').not.toBeNull();
  const janela = document.querySelector<HTMLElement>('.cds-setup-audios-scroll');
  expect(janela, 'não achei a janela da lista').not.toBeNull();

  const colunaLado = document.querySelector<HTMLElement>('.cds-setup-col-side');
  expect(colunaLado, 'não achei a coluna da ação').not.toBeNull();

  const rect = criar!.getBoundingClientRect();
  return {
    botaoForaDaTela: Math.max(0, Math.round(rect.bottom - window.innerHeight)),
    paginaPrecisaRolar: Math.max(
      0,
      Math.round(document.documentElement.scrollHeight - window.innerHeight),
    ),
    listaRolaPorDentro: janela!.scrollHeight > janela!.clientHeight + 1,
    listaInvadeAAcao: sobreposicao(
      janela!.getBoundingClientRect(),
      colunaLado!.getBoundingClientRect(),
    ),
  };
}

describe('Setup — o botão de criar a sessão está na tela, com a entrega que for (ENG-386)', () => {
  it('entrega de 40 áudios numa janela de trabalho comum: o botão cabe e a página não rola', async () => {
    const m = await medir(1280, 900, 40);

    expect(m.botaoForaDaTela, 'o botão ficou abaixo da dobra').toBe(0);
    expect(m.paginaPrecisaRolar, 'a página inteira ficou rolável').toBe(0);
    expect(m.listaRolaPorDentro, 'quem devia ceder altura é a lista').toBe(true);
    expect(m.listaInvadeAAcao, 'a lista transbordou por cima da coluna da ação').toBe(0);
  });

  it('a mesma entrega num notebook baixo (768px): o botão continua na tela', async () => {
    const m = await medir(1280, 768, 40);

    expect(m.botaoForaDaTela).toBe(0);
    expect(m.paginaPrecisaRolar).toBe(0);
    expect(m.listaRolaPorDentro).toBe(true);
    expect(m.listaInvadeAAcao, 'a lista transbordou por cima da coluna da ação').toBe(0);
  });

  it('crescer a entrega de 8 para 60 não move o botão um pixel', async () => {
    /* É a regressão exata do defeito: antes, cada áudio a mais empurrava a ação
       para baixo. O botão tem de ficar onde estava. */
    const oito = await medir(1280, 900, 8);
    const oitoRect = document
      .querySelector<HTMLElement>('.cds-setup-create')!
      .getBoundingClientRect().top;

    expect(oito.botaoForaDaTela).toBe(0);

    const sessenta = await medir(1280, 900, 60);
    const sessentaRect = document
      .querySelector<HTMLElement>('.cds-setup-create')!
      .getBoundingClientRect().top;

    expect(sessenta.botaoForaDaTela).toBe(0);
    expect(Math.round(sessentaRect)).toBe(Math.round(oitoRect));
  });

  it('empilhado em janela estreita, o botão também não afunda embaixo da lista', async () => {
    /* Empilhar é o caso perigoso: é literalmente o arranjo que tinha o defeito. Só
       não o tem porque as colunas empilhadas continuam dentro de altura definida. */
    const m = await medir(700, 800, 40);

    expect(m.botaoForaDaTela).toBe(0);
    expect(m.paginaPrecisaRolar).toBe(0);
    expect(m.listaRolaPorDentro).toBe(true);
    expect(m.listaInvadeAAcao, 'a lista transbordou por cima da coluna da ação').toBe(0);
  });
});

/**
 * ENG-674 — a barra da lista de áudios é a que a folha pede, e não uma regra morta.
 *
 * `.cds-setup-audios-scroll` declarava as duas gramáticas ao mesmo tempo: as
 * propriedades padrão (`scrollbar-width`/`scrollbar-color`) E o pseudo-elemento
 * `::-webkit-scrollbar`. No Chromium elas não convivem — declarar as padrão
 * DESLIGA a barra customizada e a largura em px é descartada em silêncio. A folha
 * pedia 9px e a tela nunca teve 9px, sem aviso nenhum.
 *
 * Por isso a prova é MEDIDA, não lida. Um teste que procurasse a declaração no
 * arquivo passaria exatamente enquanto a regra estivesse morta — que é o defeito
 * inteiro. Nem `getComputedStyle(el, '::-webkit-scrollbar').width` serve: ele
 * devolve os mesmos `9px` nos dois estados, porque a cascata resolve o pseudo-
 * elemento mesmo quando o navegador decide não desenhá-lo. O que muda entre barra
 * viva e barra morta é a largura que ela OCUPA, e essa só existe em Chromium.
 */
describe('Setup — a barra da lista de áudios está em vigor (ENG-674)', () => {
  /** A largura que `.cds-setup-audios-scroll::-webkit-scrollbar` pede. */
  const LARGURA_PEDIDA = 9;

  /**
   * A largura que a barra OCUPA, descontadas as bordas da caixa.
   *
   * `scrollbar-gutter: stable` entra AQUI, e não na folha de estilo: onde a barra
   * é de sobreposição (macOS), ela é pintada por cima do conteúdo e não tira
   * largura nenhuma — a calha mediria 0 tanto com a barra de 9px quanto sem ela, e
   * o teste passaria a depender da plataforma que o CI calhar de usar. Reservar a
   * calha não troca a barra: obriga o navegador a dizer quanto a MESMA barra mede,
   * e iguala a medida nas duas famílias de plataforma.
   *
   * As bordas saem por cálculo, não por constante: o que se afirma aqui é a barra,
   * e mudar a moldura da janela não pode derrubar este teste por tabela.
   */
  function larguraDaBarra(el: HTMLElement): number {
    const anterior = el.style.scrollbarGutter;
    el.style.scrollbarGutter = 'stable';
    const cs = getComputedStyle(el);
    const bordas = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const medida = el.offsetWidth - el.clientWidth - bordas;
    el.style.scrollbarGutter = anterior;
    return medida;
  }

  /** A barra que a plataforma daria a um scroller sem estilo nenhum, medida igual. */
  function barraPadraoDaPlataforma(): number {
    const controle = document.createElement('div');
    controle.style.cssText = 'width:300px;height:100px;overflow-y:auto';
    controle.innerHTML = '<div style="height:400px"></div>';
    document.body.appendChild(controle);
    const medida = larguraDaBarra(controle);
    controle.remove();
    return medida;
  }

  it('a barra reservada é a largura que a folha pede, não a da plataforma', async () => {
    const m = await medir(1280, 768, 40);
    expect(m.listaRolaPorDentro, 'sem transbordo não há barra para medir').toBe(true);

    const janela = document.querySelector<HTMLElement>('.cds-setup-audios-scroll');
    expect(janela, 'não achei a janela da lista').not.toBeNull();

    expect(
      larguraDaBarra(janela!),
      'a largura pedida pela folha não chegou à tela: a barra customizada está desligada',
    ).toBe(LARGURA_PEDIDA);

    /* Sem isto a asserção acima poderia estar passando à toa numa plataforma cuja
       barra padrão já meça o mesmo — e voltaria a não distinguir viva de morta. */
    expect(
      barraPadraoDaPlataforma(),
      'a medida acima não distingue nada: a plataforma já dá esta largura',
    ).not.toBe(LARGURA_PEDIDA);
  });
});
