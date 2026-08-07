# Auditoria — interação com o colar: referência × implementação

**Data:** 2026-08-05. **Fonte da verdade da referência:** `docs/reference/index.html`
(`cordInteraction` L552–598, `playEdge` L600–605, `playRange`/`togglePlay` L640–659,
`frontier`/`activeAnchor` L400–423, `primePart`/`confirmPart`/`reopenPart` L698–732,
`confirmParts` L757–767, `addFrase`/`confirmFrase`/`lockFrase` L772–799,
`offerBorderMove`/`slideSeam` L801–834, `reopenFrase`/`removeFrase` L843–855).

**Varredura completa em 2026-08-07**, a pedido do dono: além do clique e do hover
(§1–§2), passou a cobrir desenho e janela do colar, reprodução, travar/reabrir,
remover, a costura das frases e o modo revisão. Comparado contra `renderCord` L499–533,
`drawBand` L485–498, `beadColorMap` L478–484, `playRange`/`togglePlay`/`playItem`
L640–659, `renderParts` L733–756, `renderFrases` L864–893, `enterScene`/`reopenFrase`/
`removeFrase` L837–855, `confirmFrasesDone` L917–929, `enterLayer` L930–935,
`setReview` L964–977, `scrollToActive` L1386–1392.

Escopo: só a interação do **colar** (reprodução, seleção, segmentação de cenas e
frases). Não cobre Triagem, Conversa, Relatório nem Documentos.

---

## 1. O modelo de clique: agora É o da referência

**Decisão do dono, 2026-08-07:** _"o comportamento do colar para a segmentação de
cenas/frases fica estritamente igual; só o Pac-Man e o remover-absorve são
acréscimos."_ O modelo ouvir/definir-fim de 2026-07 foi **revogado**;
`domain/selection.ts` é porte 1:1 de `cordInteraction` (L561–583).

| | Referência (`cordInteraction`) | Nosso app, desde 2026-08-07 |
|---|---|---|
| Sem ancoragem ativa (Escuta) | clique **não faz nada** (`if(!aa) return`) | clique **toca a conta** — a única divergência que resta aqui (CLAUDE.md; a Escuta não é segmentação) |
| Slot recém-aberto | cena vem pré-ancorada (`primePart`); **frase não** (`addFrase` zera a seleção) | as **duas** vêm pré-ancoradas (`primeFrase`) — cena e frase são um modelo só |
| 1º clique definindo | fecha o trecho da emenda até a conta e toca **o trecho inteiro** | idem |
| 2º clique em diante | move a borda **mais próxima** (o começo inclusive) e toca **só ela** (`playEdge`) | idem |
| Empate no meio | o **começo** cede (`<=`, L580) | idem |
| Saturação do clique | entre a fronteira e o fim do colar (L566–567) | idem |

A versão anterior desta seção descrevia a divergência como "deliberada, já decidida".
Era — e foi desfeita pelo mesmo dono. Fica registrado o gatilho: o relato de que a
história não se desenrolava ao clicar na primeira conta. Na referência, esse clique
**toca da emenda até onde se clicou** — que é justamente o que faltava.

## 2. O bug de reprodução que abriu esta investigação (histórico)

Relato: "clico na primeira conta e ele só toca as três primeiras; depois seleciono um
trecho maior e ele toca só as extremidades." Depois: "funciona, mas só depois de
algumas tentativas."

**Causa:** o *dwell* de hover de borda (280 ms → `playEdge`, ~1 s de cada lado)
interrompia a reprodução que o clique tinha começado. Sob o modelo de 2026-07 isso era
bug real, porque hover e clique **discordavam**: o clique ouvia até o fim do pai, o
hover tocava só a borda. Duas correções tentaram reconciliá-los — #164 suprimindo o
dwell na **conta** clicada, #172 na **zona** da borda (a supressão por conta ainda
deixava o ponteiro escorregar uma conta e ressuscitar o dwell, daí a intermitência).

**As duas foram descartadas em 2026-08-07.** Com o `cordInteraction` restaurado, hover
e clique voltam a concordar — do segundo clique em diante o clique também toca só a
borda —, então não há o que suprimir, e suprimir seria divergir sem motivo. O dwell é
porte fiel de L584–597 e o `pointerdown` não o cancela, como lá.

Consequência aceita pelo dono: parar o ponteiro a ±1 conta de uma borda **corta** o
trecho que estiver tocando. É o comportamento do `index.html`.

## 3. Buracos no colar — o que cada um permite

- **Domínio:** idêntico à referência. `confirmPart` só recusa `selection.s < frontier`
  (sobreposição); `confirmParts` só exige **≥ 1 cena travada** e descarta a cena aberta
  que sobrou. **Nem a referência nem o nosso domínio exigem cobrir o colar inteiro** —
  deixar o rabo final sem cortar é legítimo nos dois.
- **UI:** com o `cordInteraction` restaurado, o **clique também abre vão** — puxar o
  começo para frente é um dos ramos dele (borda mais próxima). E também **fecha**: um
  clique atrás do começo o reancora na emenda. Continuam nossos o arrasto de fim
  Pac-Man (a seguinte segue, nunca abre vão entre travadas) e o remover-com-absorção.
- O arrasto do COMEÇO (`dragSelectionStart`, #168) segue existindo como o gesto
  **deliberado** de deixar um trecho fora, agora ao lado do clique que faz o mesmo por
  aproximação.

Ver §8 — isto era uma decisão pendente e já foi resolvida.

## 4. O que a referência tem e nós NÃO temos

| Item | Referência | Situação |
|---|---|---|
| `pingBead` — flash de 140 ms na conta clicada (L606) | sim | **Não implementado.** Micro-feedback tátil que some. |
| Tamanho de conta Pequeno/Médio/Grande (L256, L661) | seletor do usuário | **Não implementado** — virou preset por estação (`SIZE_M`/`SIZE_L`). Provavelmente correto no redesign; listado por completude. |
| `Limpar seleção` (`clearSel`, L910) | sim | **Não existe** — coerente com começo fixo, não há seleção livre a limpar. |
| `playSel` — "tocar este pedaço" como botão separado (L262) | sim | **Não existe** como botão; o equivalente é clicar o começo (ouvir dali). |
| `playAll` — botão que troca de alvo por modo: "ouvir a história" fora da segmentação, "ouvir **a cena**" dentro dela (L658, L910) | sim | **Não existe** nas estações Cortar e Frases. O colar É o controle (regra de UI: uma ação dominante, o áudio responde ao toque). Ouvir tudo de novo = clicar o começo. |
| `scrollToActive` — rola a PÁGINA até o cartão da camada ativa (L1386) | sim | **Não existe**, e não deve: a referência empilha cartões numa página longa. Aqui cada estação é uma tela, e quem rola é a janela do colar atrás da conta acesa (ENG-387) — resolve a mesma necessidade num layout diferente. |

### Correção desta auditoria (2026-08-07)

A versão anterior listava o `⚑ marcar para revisão` da frase como "lacuna real". **Estava
errado.** Não é lacuna: a ENG-342 o REMOVEU de propósito, trocando "reabrir + marcar" por
arrastar a alça de fim da frase no colar. O dono confirmou em 2026-08-07 que ele não volta.

Não sobrou camada a remover — `flagged` não existe em `domain/state.ts` nem no DTO de
sessão, e nem a UI nem o domínio o mencionam a não ser em comentários que registram a
remoção. O que permanece é **um campo só**, `flags`, no `retorno-ancoragem.json`, sempre
vazio: a referência o emite (`index.html` L1328), então tirá-lo quebraria a identidade
byte a byte do golden, e o Compilador o espera. `contracts/imports.ts` já IGNORA o `flags`
de um retorno antigo, então um arquivo gravado quando o recurso existia continua abrindo
sem ressuscitá-lo.

## 5. O que nós temos A MAIS que a referência

| Item | Onde | Origem |
|---|---|---|
| Clique na conta durante a Escuta toca a conta (transporte) | `clickBead` → `transport` | CLAUDE.md ("bead click plays the bead"). Na referência o clique é inerte na Escuta. |
| **Arrastar** a borda de fim de cena/frase (Pac-Man, a seguinte segue) | `dragSceneBoundary`, `dragPhraseBoundary` | ENG-342, pós-referência. |
| Prévia ao arrastar (~4 contas antes → ~3 depois) | `playEditWindow` | ENG-342. |
| **Remover cena** + a seguinte absorve o espaço | `removePart` + `absorbNextScene` | Pós-referência. A referência **só** tem Remover para **frases** (L884) e **sem** absorção. |
| Remover frase **com absorção** | `absorbNextFrase` | A referência remove sem absorver. |
| Reprodução por conta numa cena travada (toca **daquela conta** até o fim da cena; mesma conta pausa/retoma) | `playLockedSceneAt` | **Mantido por decisão do dono em 2026-08-07**, mesmo restaurando o resto: a referência toca a cena inteira por um botão ▶ em cada cartão, e as telas do ouvinte não têm essa lista — sem isto não haveria como reouvir um segmento pronto. |
| Toque na conta que brilha = pausa | `onHeadTap` | Pós-referência. |
| Momento de revisão ("Continuar →" quando a história está toda ladrilhada) | `tilesWholeStory` | Decisão do dono. |
| Arrastar o COMEÇO do segmento em definição, deixando um trecho fora de tudo | `dragSelectionStart` | Decisão do dono, 2026-08-06 (#168). Revoga em parte a regra 2 ("o começo nunca é settável"): o clique segue só setando o fim, mover o começo exige o arrasto. |
| A janela do colar ROLA sozinha atrás da conta acesa, com teto de altura por estação | `maxHeight`, ENG-387 | Pós-referência (lá a página inteira rolava). Respeita `prefers-reduced-motion`: salta em vez de deslizar. |
| Fileiras centradas, inclusive a última incompleta | `rowShift` (protótipo v3 §4) | Redesign. Aplica-se ao desenho E ao hit-test — só num dos dois, o clique cairia uma conta ao lado do que o olho vê. |

## 6. O que confere 1:1 com a referência

**Segmentação (domínio):**

- `frontier` (cenas e frases), incluindo o **back-reach** da 1ª frase à cena anterior —
  e até o *quirk* de a fronteira de frase escapar do clamp `totalBeads−1` (o ramo da
  cena ativa retorna antes dele, L401–409). Espelhado de propósito (ENG-269).
- `activeAnchor`, `primePart`, `addPart`, `confirmPart`, `confirmParts`, `reopenPart`
  (cascata: reabrir *i* destrava *i* e tudo depois; a seleção volta a ser o span do
  item reaberto).
- Ao travar um segmento, ir para o **próximo não travado**; não havendo, **criar** um
  novo já pré-ancorado na emenda (`confirmPart` L722–724, `lockFrase` L797–798).
- `confirmFrase` + `lockFrase` + as duas recusas (antes da fronteira / fora do colar).
- `removeFrase` escolhe o **último** slot não travado (`lu` sem `break`, L852) enquanto
  `enterScene` escolhe o **primeiro** (L840). Assimetria da referência, replicada.
- `confirmFrasesDone`: cena sem frases avisa e **deixa passar no segundo clique**.
- `offerBorderMove` / `slideSeam`: limiar `max(3, 25% da cena)`, escalada de duas cenas
  produtivas, "engole a vizinha inteira", as três saídas oferecidas.

**Colar (desenho e reprodução):**

- Janela da cena ativa na Segmentação: cena ± `max(3, round(2/beadSec))` contas
  (`resolveWindow` × L509), contas fora dela **esmaecidas** (`dim`).
- Banda tracejada da cena + banda da seleção, ambas quebrando por fileira (`bandRects`
  × `drawBand`); linha do cordão por fileira; contas de fim de cena travada marcadas.
- `playEdge`: janela de ~1 s de cada lado da borda (`half = round(1/beadSec)`).
- Dwell do hover: 280 ms, zona de ±1 conta, uma vez por fronteira, re-checando a
  seleção ao disparar; sair do colar zera. Idêntico a L584–597 — **exceto** pela
  supressão pós-clique da §2, que é nossa.
- Modo revisão bloqueia o **clique** no colar (`clickBead` devolve `play: null`).

## 7. Divergência latente (nenhum sintoma hoje)

Uma só, e é honesto registrá-la em vez de deixá-la para alguém tropeçar:

**O hover não checa o modo revisão.** A referência barra o dwell com `state.review` no
`pointermove` (L588); o nosso `onPointerMove` barra por `total`, `transportOnly` e
`selection`, mas não por `review`. Hoje é inalcançável — `setMode` sempre derruba
`review` (`domain/gates.ts:68`) e a única estação que a liga (Export) monta o colar em
`transportOnly`, que já corta o hover antes. Passaria a valer se alguma tela futura
mostrasse um colar **interativo com seleção** em modo revisão.

Não corrigi: `review` não é prop do organismo hoje, então a correção seria inventar uma
prop para um caso que não existe. Fica anotado.

## 8. Decisão que estava pendente — resolvida

**Buracos no meio do colar devem ser possíveis?** A versão anterior desta auditoria
deixou isso em aberto. **Resolvido pelo #168** (`dragSelectionStart`, decisão do dono de
2026-08-06): sim, e o gesto é **arrastar o começo** do segmento em definição, não
clicar. O clique continua setando só o fim; empurrar o começo para frente deixa o trecho
entre a emenda e o novo começo fora de qualquer cena ou frase — que é como o áudio cru
(hesitação, repetição, ruído) sai do treinamento sem ser removido do colar.

Isso revoga a metade "o começo NUNCA é settável" da regra 2 de
`docs/segmentation-rules.md`; o resto dela continua de pé.
