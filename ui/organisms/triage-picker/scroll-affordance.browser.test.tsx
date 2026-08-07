import { page } from 'vitest/browser';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import '../../tokens/tokens.css';
import '../../tokens/base.css';
import { TriagePicker } from './triage-picker';

/**
 * ENG-390, segunda metade — a grade precisa DIZER que continua.
 *
 * O defeito que a issue conserta era: "as pessoas classificavam a partir de uma
 * lista curta acreditando ser a lista inteira". Achatar a grade tirou o
 * disclosure escondido, mas pôs os 27 tipos numa região que rola — e numa tela de
 * 900px cabem 12. Se essa região rolar em silêncio, o defeito volta com outra
 * roupa: lista curta à vista, resto invisível, nenhuma pista.
 *
 * Roda no Chromium de verdade porque a pergunta é de layout: quanto cabe, e o que
 * o usuário vê na borda. jsdom não tem layout e responderia qualquer coisa.
 *
 * O que este teste NÃO prova: que a pista é bonita ou suficiente. Prova que ela
 * existe e que ninguém a apagou — em especial escondendo a barra de rolagem por
 * estética, que é o caminho mais provável para a regressão.
 */

let root: Root | null = null;
let host: HTMLElement | null = null;

function montar(): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  flushSync(() => root!.render(<TriagePicker />));
  const scroll = host.querySelector<HTMLElement>('.cds-triage-picker-scroll');
  expect(scroll, 'a grade não tem região de rolagem').not.toBeNull();
  return scroll!;
}

afterEach(() => {
  flushSync(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('a grade dos 27 tipos avisa que continua', () => {
  it('há mesmo conteúdo escondido — senão este teste não tem sobre o que falar', () => {
    const scroll = montar();

    expect(
      scroll.scrollHeight,
      'a grade coube inteira: reveja o cenário, não a pista',
    ).toBeGreaterThan(scroll.clientHeight);
  });

  it('a barra de rolagem não está escondida', () => {
    const scroll = montar();

    /* `scrollbar-width: none` é o jeito mais comum de "limpar" visualmente uma
       região que rola — e apaga a única pista que o sistema dá de graça. */
    expect(getComputedStyle(scroll).scrollbarWidth).not.toBe('none');
  });

  it('a borda de baixo some quando se chega ao fim da lista', async () => {
    /*
     * A afirmação é a da versão anterior deste teste — "tem mais" e "acabou"
     * precisam SER DIFERENTES na borda de baixo. Mudou o instrumento, e a razão
     * merece ficar registrada, porque a original não podia passar:
     *
     * A primeira versão comparava `getComputedStyle(scroll).backgroundPosition`
     * antes e depois de rolar, contando com gradientes
     * `background-attachment: local`. Medido neste mesmo Chromium: esse valor
     * NÃO se move. `local` desloca a ORIGEM DE PINTURA do fundo; o valor
     * computado continua sendo o especificado (`50% 100%`) em qualquer
     * scrollTop. E nenhuma outra técnica salva a asserção: um estado em JS chega
     * tarde demais (atribuir `scrollTop` não dispara `scroll` de forma síncrona)
     * e uma animação de timeline morre sob `prefers-reduced-motion` — justamente
     * quem mais precisa da pista.
     *
     * Medir o fundo também não bastaria: os 27 cartões são OPACOS, e uma sombra
     * pintada no fundo da caixa some atrás deles (medido: só aparecia nos 9px de
     * vão). Por isso a pista é um elemento por cima, e por isso o que se mede
     * aqui são PIXELS: fotografa-se a região nos dois estados.
     *
     * A grandeza é a UNIFORMIDADE da faixa junto à borda, não o seu brilho: o
     * brilho médio muda sozinho quando o conteúdo rola (outra fileira de
     * cartões), e uma asserção sobre ele passa mesmo com a pista desligada —
     * verificado. Já o véu achata a faixa: com mais lista abaixo o desvio ali é
     * ~2, sem pista nenhuma é ~63, e no fim da lista (véu apagado, cartões
     * nítidos) é ~11.
     */
    const scroll = montar();

    /** Desvio-padrão do brilho na faixa colada à borda inferior. */
    async function uniformidadeDaBorda(): Promise<number> {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const { base64 } = await page.screenshot({ element: scroll, base64: true });
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${base64}`)).blob(),
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      /* 4px acima da borda: a última fileira de pixels pega a antisserrilha do
         recorte e ruído dela não é pista nenhuma */
      const { data } = ctx.getImageData(0, bitmap.height - 9, bitmap.width, 5);
      const brilhos: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        brilhos.push((data[i]! + data[i + 1]! + data[i + 2]!) / 3);
      }
      const media = brilhos.reduce((a, b) => a + b, 0) / brilhos.length;
      const variancia = brilhos.reduce((a, b) => a + (b - media) ** 2, 0) / brilhos.length;
      return Math.sqrt(variancia);
    }

    const comMaisAbaixo = await uniformidadeDaBorda();
    scroll.scrollTop = scroll.scrollHeight;
    const noFim = await uniformidadeDaBorda();

    expect(
      comMaisAbaixo,
      'com lista abaixo, a borda não está velada: nenhuma pista de que continua',
    ).toBeLessThan(6);
    expect(
      noFim,
      'a pista de borda não reage à rolagem: continua lá depois do último tipo',
    ).toBeGreaterThan(comMaisAbaixo * 2);
  });

  it('a pista se pinta pelo papel do tema, não por um literal', () => {
    /* Um véu calibrado para o creme fica invisível na superfície escura. Ele
       termina no fundo da PÁGINA, que é papel — então a mesma regra serve os
       dois temas, e é isso que se confere aqui. */
    const scroll = montar();
    const shade = scroll.querySelector<HTMLElement>('.cds-triage-picker-more');
    expect(shade, 'a região não tem a faixa da borda').not.toBeNull();

    document.documentElement.setAttribute('data-cds-theme', 'light');
    const claro = getComputedStyle(shade!).backgroundImage;
    document.documentElement.setAttribute('data-cds-theme', 'dark');
    const escuro = getComputedStyle(shade!).backgroundImage;
    document.documentElement.removeAttribute('data-cds-theme');

    expect(escuro).not.toBe(claro);
  });
});
