# Auditoria — interação com o colar: referência × implementação

**Data:** 2026-08-05. **Fonte da verdade da referência:** `docs/reference/index.html`
(`cordInteraction` L552–598, `playEdge` L600–605, `playRange`/`togglePlay` L640–659,
`frontier`/`activeAnchor` L400–423, `primePart`/`confirmPart`/`reopenPart` L698–732,
`confirmParts` L757–767, `addFrase`/`confirmFrase`/`lockFrase` L772–799,
`offerBorderMove`/`slideSeam` L801–834, `reopenFrase`/`removeFrase` L843–855).

Escopo: só a interação do **colar** (reprodução, seleção, segmentação de cenas e
frases). Não cobre Triagem, Conversa, Relatório nem Documentos.

---

## 1. O modelo de clique: divergência DELIBERADA, já decidida

Esta é a diferença mais importante e **não é um bug**. Está registrada em
`docs/segmentation-rules.md` ("owner decisions, 2026-07"), que declara explicitamente
ter prioridade sobre a referência para interação de segmentação.

| | Referência (`cordInteraction`) | Nosso app (`domain/selection.ts` + páginas) |
|---|---|---|
| Sem ancoragem ativa (Escuta) | clique **não faz nada** (`if(!aa) return`) | clique **toca a conta** (`transport`) |
| 1º clique definindo | fixa o **começo**, toca **1 conta** (`playRange(b,b)`) | começo é **fixo na fronteira**; clicar nele **ouve dali até o fim do pai** |
| 2º clique | fecha o range, toca o **range inteiro** | define o **FIM**; para se o playhead já passou, senão **continua tocando** |
| 3º clique em diante | move a borda mais próxima, toca **só a borda** (`playEdge`, ±1 s) | idem 2º clique: redefine o FIM |
| Começo settável | **sim** | **não, nunca** (regra 7) |

Consequência direta: **a referência permite deixar buracos no meio do colar** (o 1º
clique pode cair depois da fronteira), o nosso modelo **não** — o começo é sempre a
emenda. Ver §3.

## 2. O bug real de reprodução (corrigido nesta branch)

Relato: "clico na primeira conta e ele só toca as três primeiras; depois seleciono um
trecho maior e ele toca só as extremidades."

**Causa raiz:** `ui/organisms/necklace/necklace.tsx` armava o *dwell* de hover de
borda (280 ms → `onEdgeHover` → `player.playEdge`, ~4 contas em volta) e **não o
cancelava no clique**. Na primeira segmentação a seleção é `{s:0,e:0}`, então a conta
0 **é** borda: o clique começava a história inteira e 280 ms depois o timer atrasado a
interrompia para tocar só a beirada. Ao definir o FIM, a conta sob o ponteiro parado
virava borda e qualquer tremor do mouse re-armava o dwell — "toca só as extremidades".

O dwell foi portado fielmente da referência (L587–596), onde hover e clique
**concordavam** (clicar numa borda também tocava só a borda). No nosso modelo eles
discordam, e ninguém reconciliou os dois.

**Correção:** o clique cancela o dwell e suprime o hover **na conta tocada** até o
ponteiro sair dela. Sair do colar zera a supressão. Um hover deliberado (sair e
voltar) continua conferindo a borda. Coberto por 2 testes novos em Chromium real
(`necklace.browser.test.tsx`).

## 3. Buracos no colar — o que cada um permite

- **Domínio:** idêntico à referência. `confirmPart` só recusa `selection.s < frontier`
  (sobreposição); `confirmParts` só exige **≥ 1 cena travada** e descarta a cena aberta
  que sobrou. **Nem a referência nem o nosso domínio exigem cobrir o colar inteiro** —
  deixar o rabo final sem cortar é legítimo nos dois.
- **UI:** como o começo é sempre a fronteira, **buraco no meio é impossível de criar**
  no nosso app; o arrasto é Pac-Man (a seguinte segue, nunca abre vão) e remover faz a
  seguinte absorver o espaço. Na referência dá para deixar vão no meio.

**Decisão pendente do dono** (§7).

## 4. O que a referência tem e nós NÃO temos

| Item | Referência | Situação |
|---|---|---|
| `pingBead` — flash de 140 ms na conta clicada (L606) | sim | **Não implementado.** Micro-feedback tátil que some. |
| Tamanho de conta Pequeno/Médio/Grande (L256, L661) | seletor do usuário | **Não implementado** — virou preset por estação (`SIZE_M`/`SIZE_L`). Provavelmente correto no redesign; listado por completude. |
| `Limpar seleção` (`clearSel`, L910) | sim | **Não existe** — coerente com começo fixo, não há seleção livre a limpar. |
| `playSel` — "tocar este pedaço" como botão separado (L262) | sim | **Não existe** como botão; o equivalente é clicar o começo (ouvir dali). |

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
| Reprodução por conta numa cena travada (toca **daquela conta** até o fim da cena; mesma conta pausa/retoma) | `playLockedSceneAt` | `docs/segmentation-rules.md` regra 1. A referência toca a cena **inteira** por um botão ▶. |
| Toque na conta que brilha = pausa | `onHeadTap` | Pós-referência. |
| Momento de revisão ("Continuar →" quando a história está toda ladrilhada) | `tilesWholeStory` | Decisão do dono. |

## 6. O que confere 1:1 com a referência

- `frontier` (cenas e frases), incluindo o **back-reach** da 1ª frase à cena anterior.
- `activeAnchor`, `primePart`, `addPart`, `confirmPart`, `confirmParts`, `reopenPart`
  (cascata: reabrir *i* destrava *i* e tudo depois).
- `confirmFrase` + `lockFrase` + as duas recusas (antes da fronteira / fora do colar).
- `offerBorderMove` / `slideSeam`: limiar `max(3, 25% da cena)`, escalada de duas cenas
  produtivas, "engole a vizinha inteira", as três saídas oferecidas.
- `playEdge`: janela de ~1 s de cada lado da borda.
- Modo revisão bloqueia a interação no colar.

## 7. Decisão pendente do dono

**Buracos no meio do colar devem ser possíveis?** Hoje não são (§3). Permitir exigiria
reabrir a regra "o começo nunca é settável" — o coração de
`docs/segmentation-rules.md`. Não mexi nisso: é decisão de produto.
