# Pacote de melhorias UI/UX — implementação

Entrega correspondente à lista pedida (agosto/2026). Arquivo de código:
`entrega/pacote-melhorias-ui.html` — copie os blocos `[1] CSS` e `[3] JS`;
o markup de referência de cada item está nas demos, marcado `[2.x] TEMPLATE`.
A moldura do documento e o script "DEMO" no fim **não** são para copiar.

Protótipos de referência no projeto: `Colar de Sons - Protótipo v2.dc.html`
(comportamento completo) e `Colar de Sons - Lista de frases (explorações).dc.html`
(decisão da opção 1b).

**Nada aqui toca os invariantes (PRD §7):** schemas dos JSONs, IDs, `scene_kind`
em inglês, confiança `alta/média/baixa`, gates e semântica de costura ficam idênticos.
É tudo camada de interface.

---

## 1 · Setup: lista de áudios + Continuar sempre visível

- Layout `.cds-setup`: coluna esquerda = lista de áudios (`.cds-setup__scroll` rola
  sozinha, `.cds-scroll` para a barra fina); coluna direita = resumo do áudio,
  nome da história, conta do projeto e o botão `.cds-continue` — **sempre na tela**,
  nunca abaixo da lista.
- Linha de áudio = `role="radio"` + `aria-checked`; selecionar deve: marcar a linha,
  preencher o resumo ("Áudio pronto — nome"), acender o Continuar
  (`aria-disabled="false"`).
- Continuar clicado sem áudio: não navegue — mostre `.cds-hint`
  "Escolha um áudio na lista para continuar." e um bip curto de negação.
- Mantenha o "ou arraste um arquivo WAV aqui" como linha discreta no rodapé da lista.
- A tela inteira deve caber na altura da janela (`overflow:auto` só como salvaguarda
  em janelas muito baixas — nunca `hidden`, senão o Continuar some).

## 2 · Colar dentro de janela de scroll

- Envolva as fileiras do colar em `<div class="cds-window cds-scroll">` (variante
  `cds-window--dark` nas telas olive: Ouça a história). O primeiro filho é a coluna
  de fileiras — o `CdsFollow` depende disso e do `position:relative` da janela.
- No loop de reprodução, a cada avanço do playhead:
  `CdsFollow.toBead(janela, indiceDaConta, CONTAS_POR_FILEIRA)` — rolagem suave,
  só quando muda de fileira.
- Título, botão de play e confirmações ficam **fora** da janela: a página não rola.
- Aplicar em: Ouça a história, Corte em cenas, Guardar (colar completo) e, com
  `max-height` menor, na faixa da cena em Segmentação.

## 3 · Lista de cenas/frases: fio de contas (decisão 1b)

- Rodapé fixo `.cds-footbar`: rótulo de contagem ("6 frases nesta cena") + faixa
  `.cds-footbar__strip` + botões de navegação da etapa (Confirmar as cenas /
  Pronto com esta cena) — tudo sempre visível.
- Na faixa, monte o fio:

```js
const fio = CdsBeadStrip.mount({
  el: document.querySelector('#fio-frases'),
  palette: 'frase',                        // 'cena' no rodapé de cenas
  items: frases.map((p,i) => ({ label:'Frase '+(i+1), sub: fmt(duracao(p)) })),
  onPick(i){ tocarTrecho(frases[i]); },    // tocar = ouvir; o ouvido decide
  actions: [
    { title:'ouvir a frase', svg:PLAY, primary:true, onClick:i => tocarTrecho(frases[i]) },
    { title:'marcar para revisar', svg:FLAG, onClick:i => alternarRevisao(i) },
    { title:'remover', svg:X, onClick:i => { removerFrase(i); fio.update(novaLista()); } }
  ]
});
```

- No rodapé de cenas as ações são `▶ ouvir` + `Reabrir` (reabrir a cena *i* destrava
  tudo depois dela — regra existente).
- **Limpar a seleção** (`fio.clear()` ou `update`) ao: remover/reabrir item, trocar de
  cena ativa, trocar de modo e **abrir/retomar outra sessão** — senão a seleção vaza.
- Sem número dentro da conta (decisão de revisão): a cor identifica, "Frase N" na
  cápsula numera. Estado vazio: `.cds-footbar__empty` com o link de exemplo atual.

## 4 · Indicador de cena na triagem: cor + número

- `CdsSceneDots.render(el, cenas, indiceAtivo, aoTocar)` com
  `{ state:'pending'|'tagged'|'none_fit', color:{b,l} }` — as cores vêm da paleta
  de cenas (`CdsBeadStrip.PALETTES.cena`), as MESMAS do colar.
- Leitura sem texto: cheia + selo ✓ = classificada; contorno colorido = pendente;
  apagada (45%) = nenhum se encaixa; a ativa cresce (38px) com halo telha.
- Números aparecem **apenas** nesses indicadores (e no selo "Cena N" do cabeçalho
  da segmentação) — nunca nas contas do colar nem no fio do rodapé.

## 5-7 · Triagem: sem agrupamentos, lista completa, ações fixas

- Remova o bloco "Mais comuns", os 6 temas e o disclosure "ver todos os tipos por
  tema". A grade `.cds-triage__grid` mostra os **27 tipos de uma vez**, ordem
  alfabética PT-BR, 3 colunas.
- Estrutura de tela: topo fixo (indicadores + "Cena N" + título + "Ouvir esta cena"),
  miolo `.cds-triage__grid-wrap` (o único que rola), barra fixa `.cds-triage__bar`
  com "Nenhum se encaixa" e "Já classifiquei todas →".
- O ponto colorido do cartão é identidade do tipo (pode manter as cores por tema),
  não título de grupo. `title` = valor inglês (`GLEANING` etc.) — o dado não muda.
- "Já classifiquei todas" fica **sempre presente**: `aria-disabled="true"` até tudo
  classificado com ≥1 produtiva; clique antecipado mostra `.cds-hint`
  "Ainda falta(m) N cena(s) para classificar — toque nas bolinhas numeradas."
- O gate e a mensagem de trava total ("nenhuma cena se encaixou…") continuam os mesmos.
- Etapa de confiança (Certeza/Quase/Na dúvida) não muda.

## 8 · Tema escuro

- Boot: `CdsTheme.init()` (lê `localStorage('colar-theme')`, aplica
  `data-cds-theme` no `<html>`). Botão `.cds-themebtn` no cabeçalho (painel e sessão)
  chama `CdsTheme.toggle()` — lua no claro, sol no escuro (o CSS já alterna os ícones).
- Migre as superfícies claras para as variáveis: fundos `--cds-bg/card/chip/wash`,
  textos `--cds-ink/soft/faint`, linhas `--cds-hair/hair2`, botão forte
  `--cds-sbg/sfg`, acento em texto `--cds-ak`, positivos `--cds-ok`, erros
  `--cds-ebg/efg`.
- **Não** mudam com o tema: telas cerimoniais (Ouça a história, Mapeamento — olive
  `#3F3E20` sempre), botões telha (`#BE4A01` + creme), paletas de cena/frase.
- Contas em fundo escuro: use o tratamento "unDark" (pérola translúcida creme) para
  contas não tocadas; marcador quadrado de fim de cena ganha aro creme 30%.
- Ícone/logo Shemá: telha/verde no claro → branco no escuro.

## 9 · Confirmação ao gravar de novo

- Rótulos dos botões da resposta existente: "ouvir a resposta" (▶) e
  "gravar de novo" (mic) — não "de novo" solto.
- "gravar de novo" → `CdsRerecord.open({ secs, onConfirm, onKeep })`:
  - Título: "Gravar esta resposta de novo?"
  - Corpo: "A resposta que já foi gravada (m:ss) será apagada, e uma nova gravação
    começa na hora. Isso não tem volta."
  - Confirmar = apagar **e iniciar a gravação imediatamente** (uma intenção só);
    Manter = Esc, clique fora ou o botão fantasma.
- O modal cuida de `role="dialog"`, `aria-modal`, foco no primário e devolução de foco.

## 10 · Trava durante a gravação

- Ao iniciar a gravação: pare a reprodução do colar e cancele o
  `speechSynthesis` da pergunta.
- Marque com `data-rec-lock`: ← anterior, Próxima pergunta, Ouvir a pergunta,
  Ouvir a história/esta cena/esta frase, e o voltar do cabeçalho ("Histórias").
- `CdsRecLock.set(telaDeMapeamento, true)` no start / `false` no stop — aplica
  `.cds-recording` (opacity .32 + pointer-events:none) **e** `aria-disabled` +
  `tabindex=-1` (teclado também trava).
- Cinto e suspensório: embrulhe os handlers com
  `CdsRecLock.guard(() => gravando, bipDeNegacao)(handler)` — clique negado responde
  com bip curto (~205 Hz, serrote, 130 ms), não com texto.
- Enquanto grava: ponto pulsante `.cds-recdot` junto de "Gravando… m:ss" e a legenda
  do fio vira "gravando — os outros botões esperam a resposta".
- O único botão vivo é o de parar a gravação.

---

## Acessibilidade (resumo)

- Radios do setup: `role="radio"` + `aria-checked`; fio de contas: `aria-pressed`
  + `aria-label` "Frase N"; indicadores: `aria-label` "Cena N".
- Botões desabilitados usam `aria-disabled` (não `disabled`) para poderem explicar
  o porquê no clique — mas os `data-rec-lock` ficam realmente inertes via tabindex.
- `prefers-reduced-motion: reduce` já desativa pulso, fades e transições no CSS.
- Foco visível: mantenha o contorno telha 3px do app em todos os novos botões.

## Checklist de QA

1. Setup: 10+ áudios → lista rola, Continuar visível sem rolar a página; Continuar
   sem seleção → aviso + bip; selecionar → botão acende.
2. Ouvir: play → a janela do colar acompanha a conta acesa; página não rola.
3. Cortar: 8+ cenas → fio no rodapé, contas sem número; tocar conta → toca a cena e
   abre a cápsula; Reabrir some com a seleção; "Confirmar as cenas" sempre visível.
4. Frases: remover pela cápsula → fio e colar atualizam, seleção limpa; trocar de
   cena/sessão → nenhuma cápsula aberta sozinha.
5. Triagem: 27 cartões visíveis rolando só no miolo; "Nenhum se encaixa" e
   "Já classifiquei todas" fixos; clique antecipado → "Ainda faltam N cenas…".
6. Tema: alternar → persiste após recarregar; cerimoniais continuam olive; contraste
   de textos ok nos dois temas.
7. Regravar: abre confirmação com duração; Esc mantém; confirmar já entra gravando.
8. Gravando: prev/next/ouvir/TTS/voltar apagados e sem resposta a clique (só o bip),
   Tab não os alcança; parar a gravação restaura tudo.
9. Exportar uma sessão completa antes/depois do pacote → JSONs e relatório idênticos.

## Fora do escopo desta entrega

- Gravação real (MediaRecorder) e descarte do blob — `onConfirm` é o gancho.
- Persistência da sessão/tema no servidor (tema usa `localStorage` local).
- A trava de granularidade (entrega anterior: `entrega/trava-granularidade.*`).
