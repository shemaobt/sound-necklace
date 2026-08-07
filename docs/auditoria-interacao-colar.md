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

## 1. O modelo de clique: nem o antigo, nem o da referência

O clique mudou DUAS vezes em 2026-08-07. De manhã o dono pediu fidelidade estrita e o
`cordInteraction` foi restaurado. À noite, com o app rodando, ele viu o efeito real e
mudou de novo: _"o intuito é ele escutar a cena completamente, não só as extremidades,
que ele nem sabe onde vão ser"_.

| | Referência (`cordInteraction`) | Nosso app, forma atual |
|---|---|---|
| Sem ancoragem ativa (Escuta) | clique **não faz nada** | clique **toca a conta** (CLAUDE.md; a Escuta não é segmentação) |
| Slot recém-aberto | cena pré-ancorada (`primePart`); frase não | **nenhuma** pré-ancoragem, nas duas camadas |
| 1º clique | fixa o começo, toca **1 conta** (`playRange(b,b)`) | marca o começo e o áudio **CORRE** dali até o fim do pai |
| 2º clique | fecha o trecho, toca o trecho | fecha o trecho; **para** se o playhead passou do fim, **continua** se não chegou |
| 3º em diante | move a borda mais próxima, toca **só a borda** (`playEdge`) | move a borda mais próxima e toca o **trecho resultante inteiro** |
| Clique na conta de começo | move o começo, toca a borda | **reouve o trecho** (o `playSel` que a ENG-291 tirou) |
| Empate no meio / saturação | começo cede (`<=`); entre fronteira e fim do colar | idem |

O que sobrou da referência no ramo 3 é a escolha da borda mais próxima e o clamp.

**O preço, registrado:** sem pré-ancoragem, o começo vem do clique — então **vão
acidental entre cenas passa a ser possível**. A contiguidade era de graça (o começo era
sempre a emenda) e agora é algo que o usuário pode errar. O vão deliberado da §3 deixa
de se distinguir de um clique impreciso.

## 2. O bug de reprodução que abriu esta investigação (histórico)

Relato: "clico na primeira conta e ele só toca as três primeiras; depois seleciono um
trecho maior e ele toca só as extremidades." Depois: "funciona, mas só depois de
algumas tentativas."

**Causa:** o *dwell* de hover de borda (280 ms → `playEdge`) interrompia a reprodução
que o clique tinha começado. Sob o modelo de 2026-07 isso era bug real, porque hover e
clique **discordavam**. Duas correções tentaram reconciliá-los — #164 suprimindo o dwell
na **conta** clicada, #172 na **zona** da borda —, e ambas foram **descartadas** quando
o `cordInteraction` foi restaurado, porque ali hover e clique concordam.

Na forma atual eles voltam a discordar em parte (o clique toca trechos, o hover toca a
borda), mas o dwell segue sem supressão: o 1º e o 2º clique não competem com ele, e do
3º em diante o hover é justamente a lupa de borda que o ajuste pede. **Se o dono
relatar de novo áudio cortado ao parar o mouse perto de uma borda, é aqui que se olha.**

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
| `playSel` — "tocar este pedaço" como botão separado (L262) | sim | **Não existe como botão** (ENG-291 tirou os play das estações do ouvinte). Desde 2026-08-07 o equivalente é **clicar a conta de começo**, que retoca o trecho fechado inteiro — foi o dono notar que, sem isso, quem corta só ouviria as extremidades. |
| `playAll` — botão que troca de alvo por modo: "ouvir a história" fora da segmentação, "ouvir **a cena**" dentro dela (L658, L910) | sim | **Não existe** nas estações Cortar e Frases. O colar É o controle (regra de UI: uma ação dominante, o áudio responde ao toque). Clicar o começo reouve **o trecho em definição**, não a história/cena inteira — reouvir o pai continua sem equivalente aqui. |
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
