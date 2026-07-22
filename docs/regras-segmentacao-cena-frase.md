# Regras de segmentação — cena e frase são o MESMO modelo

**Status:** decisões do dono (2026-07), tomadas iterando no protótipo real. Onde
divergem do `docs/reference/index.html` ou do PRD v2 original, **estas regras
vencem** para a interação de segmentação (cena e frase). O comportamento
byte-idêntico ao reference (golden harness) é preservado — ver "Como não quebra o
golden" no fim.

**Princípio único:** a segmentação de **cenas** (Escuta 2 / Cortar) e a de
**frases** (Segmentação) têm comportamento **idêntico**. Toda regra abaixo vale
para os dois, trocando "cena↔frase" e "colar↔cena-pai". Se um dia divergirem, é
bug.

Vocabulário: um **segmento** é uma cena (dentro do colar) ou uma frase (dentro da
cena-pai). O **pai** é o colar (para cenas) ou a cena produtiva ativa (para
frases). Contas são o sistema de coordenadas; um segmento é um `span {s, e}`
inclusivo.

---

## 1. Reproduzir (áudio)

- **Clicar num segmento travado toca o segmento INTEIRO** (do início ao fim),
  não do ponto tocado. A chave de reprodução é por segmento (`part_id` / `prop_id`):
  tocar qualquer conta dele toca-o do começo; tocar o mesmo segmento de novo
  **pausa/retoma** no lugar. Vale igual para cena, frase e Triage.
- **Ao DEFINIR um segmento** (cortar), o toque reproduz a **seleção inteira**
  (início→fim), não só a janela da borda. A prévia curta do fim (≈1 s) fica
  reservada ao **ajuste da fronteira** (arrastar o punho / passar o mouse na
  borda).

_Divergência do reference:_ a cena tocava da-conta-tocada-até-o-fim com chave
por-conta (ENG-347); agora toca inteira, como a frase e a Triage já faziam.

## 2. Ajustar a fronteira — só o FIM arrasta

- Cada segmento travado tem **um único punho de arrasto: o seu FIM**. O **começo
  nunca** tem punho — o começo é a emenda (o fim do segmento anterior + 1).
- Vale **independente de ser o primeiro ou o último** segmento. O começo do
  primeiro (conta 0 / início da cena-pai) é fixo.
- Para mover o começo de um segmento, arrasta-se o **fim do anterior**.

## 3. Arrastar é Pac-Man / ladrilhado — a próxima SEGUE (sem vão)

- Ao arrastar o fim de um segmento, o **segmento seguinte acompanha a fronteira**
  nas duas direções: o início dele passa a ser `novoFim + 1`.
  - **Encolher** (arrastar para a esquerda) → o seguinte **cresce** para
    preencher. **Nunca abre um vão.**
  - **Crescer** (arrastar para a direita) → o seguinte **encolhe** (é empurrado).
- **Clampes:** o segmento arrastado nunca fica vazio (`novoFim ≥ início`); o
  seguinte nunca fica vazio (`novoFim ≤ fimDoSeguinte − 1`).
- **Último segmento** (sem seguinte): o fim cresce/encolhe **livre** até o fim do
  pai (fim do colar / fim da cena). Encolher aqui deixa a cauda por cortar — é o
  espaço onde o próximo segmento será criado.
- Depois de cada arrasto, o slot pendente é **reancorado** na nova fronteira
  (`primePart` / `primeFrase`), senão o clique seguinte fecharia na emenda antiga.

_Divergência do reference:_ o reference não tinha arrasto (tinha "reabrir",
apagado na ENG-342). Uma iteração intermediária deixou o arrasto **esparso**
(encolher abria vão) — **descartado**: a regra é ladrilhado/Pac-Man.

## 4. Remover — a próxima ABSORVE o espaço

- Remover um segmento **do meio** → o **segmento seguinte** (o travado de menor
  início depois do removido) estica o **seu início para trás** até o começo do
  removido, engolindo o espaço. **Não fica vão.**
- Sem seguinte (removeu o último), o espaço fica por re-cortar.
- O botão **Remover** existe no chip de cena **e** de frase (simétrico).

_Divergência do reference:_ a cena não tinha remoção; a frase tinha `removeFrase`
que **filtrava sem absorver**. A absorção é decisão do dono.

---

## Onde vive no código

| Regra | Domínio (puro) | Composição na UI |
|---|---|---|
| 1 — tocar inteiro | — | `playLockedSceneAt`/`playLockedPhraseAt`, `playSelectionOrAction` (@/ui/pages/cut/cutting.ts) |
| 2 — só o fim arrasta | — | `dragHandles` só no fim (@/ui/pages/cut, @/ui/pages/phrases) |
| 3 — Pac-Man + reancorar | `dragSceneBoundary` (@/domain/seam.ts), `dragPhraseBoundary` (@/domain/phrases.ts) | `primePart(dragSceneBoundary(...))` / `primeFrase(dragPhraseBoundary(...))` |
| 4 — remover + absorver | `removePart`/`removeFrase` (PUROS, fiéis ao reference) + `absorbNextScene`/`absorbNextFrase` | `absorbNextScene(removePart(...), gapStart)` / idem frase |

## Como isto NÃO quebra o golden

O golden harness compara byte-a-byte contra o `reference/index.html` e replay as
funções puras do domínio direto (`removeFrase`, `slideSeam`, …). Por isso as
funções que o golden testa ficam **fiéis ao reference**:

- `removePart` / `removeFrase` **não absorvem** — a absorção é um passo **separado**
  (`absorbNextScene` / `absorbNextFrase`) composto **só na UI**, fora do escopo do
  golden, exatamente como o reprime pós-arrasto.
- `dragSceneBoundary` / `dragPhraseBoundary` são features pós-reference (ENG-342),
  não exercitadas por nenhum caso golden — livres para evoluir.

Resultado: todas estas regras são **golden-safe**; o golden segue 16/16 e
byte-idêntico ao reference. Nunca "regenerar" o esperado para acomodar uma destas
regras — se o golden ficar vermelho, a mudança está no lugar errado (deve ser
composta na UI, não enfiada na função pura).
