# Golden harness — o portão de merge

Reproduz conjuntos roteirizados de decisões através da referência executável
(`docs/reference/index.html`, INTOCÁVEL) e do `domain/`+`contracts/`, e compara
os artefatos **byte a byte**. Nenhum PR mergeia vermelho. Se a sua mudança
quebra o harness, a mudança está errada — não o harness.

## Duas provas, um check

1. **`pnpm golden:verify`** — regenera os goldens da referência em Chromium
   headless e byte-compara com `expected/` comitado → goldens nunca podem ser
   editados à mão nem derivar da referência.
2. **`pnpm golden`** — reproduz cada caso através de `domain/`+`contracts/`
   (via `registry.ts`) e byte-compara com os mesmos goldens.

Juntas: `domain ≡ referência`. Fases de rigor: infra (ENG-212; casos sem
replayer ficavam PENDENTES) → **ENG-238 ligou `STRICT = true`** (pacote de 14
casos de borda registrado; caso sem replayer agora REPROVA, zero pendências) →
nunca mais afrouxa (CLAUDE.md, gate 1).

## Como a referência é dirigida (generate.mjs)

`page.goto(file://…/docs/reference/index.html)` + **um `page.evaluate` por
caso** que seta `state` e chama as funções globais reais (`buildBeads`,
`hashPCM`, `confirmWhole`, `confirmPart`, `slideSeam`, `buildReturn`, …) — sem
cliques de UI e **sem decodificar áudio**: `hashPCM` lê só
`{numberOfChannels, sampleRate, getChannelData(0)}`, então um objeto simples
com PCM sintético substitui o AudioBuffer.

Serialização capturada exatamente como a referência serializa:
`JSON.stringify(x, null, 2)` **sem** newline final para os JSON; o `.md` é
`join("\n")` com exatamente **um** newline final.

## PCM sintético (determinístico por construção)

LCG com aritmética **BigInt** (1103515245·x excede 2^53 — em double perderia
precisão; em BigInt o inteiro é exato em qualquer engine):

```
x_{n+1} = (1103515245 · x_n + 12345) mod 2^31
amostra_n = x_n / 2^30 − 1        → Float32Array (faixa [−1, 1))
```

Vetores de verificação (seed 42): x₁ = 1250496027, x₂ = 1116302264.
Implementações espelhadas: `pcm.ts` (TS, usada pelos replayers) e o bloco
`makePcm` dentro de `generate.mjs` (JS, roda na página). `Math.random`/
`Math.sin` são PROIBIDOS aqui (não são bit-idênticos entre engines).

## Vocabulário de passos (`cases/*.json`)

Cada caso: `{ name, description, steps: [...] }`. Passos, na ordem em que o
fluxo real os permite:

| Passo           | Campos                                                                    | Efeito na referência                                                                                                                |
| --------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `segment`       | `beadSec, slug, audioFilename, pcm:{seed, sampleRate, samples, channels}` | Espelha a inicialização de `segment()` (L454–472) com o buffer sintético; `duração = samples/sampleRate`                            |
| `confirmWhole`  | —                                                                         | `confirmWhole()`; o fluxo guiado abre a 1ª cena pré-ancorada                                                                        |
| `cutScene`      | `endBead`                                                                 | Seleção `{s: frontier('parts'), e: endBead}` + `confirmPart(atual)`                                                                 |
| `confirmParts`  | —                                                                         | `confirmParts()` → descarta slots não travados, vai à Triagem                                                                       |
| `triage`        | `partIndex` + (`kind`,`confidence`) ou `none_fit:true`                    | Escreve `tag_state/scene_kind/scene_kind_confidence` como o picker (L1258–1266)                                                     |
| `triagemDone`   | —                                                                         | `setMode('segmentacao')` (redirect do setMode é o contrato)                                                                         |
| `enterScene`    | `partId`                                                                  | `enterScene(partId)` — atenção: cria slot P# pendente se não houver                                                                 |
| `phraseSelect`  | `s, e`                                                                    | Seta `selection` completa (`pendingStart=null`)                                                                                     |
| `confirmPhrase` | `borderDecision?: "move"\|"reanchor"\|"triagem"`                          | `confirmFrase(atual)`; se cruzou a borda, aplica a decisão como o usuário (move = `slideSeam`+`lockFrase`, espelho de doMove L814)  |
| `removePhrase`  | `index`                                                                   | `removeFrase(index)` — libera o P# (índice em `state.frases`)                                                                       |
| `sceneDone`     | `forceEmpty?: true`                                                       | `confirmFrasesDone()`; com `forceEmpty`, chama 2× (aviso de cena vazia → segue)                                                     |
| `answer`        | `level (1\|2\|3), key, partId? (L2), propId? (L3), text`                  | `ensureMapping()` + escreve em `state.mapping.levelN`                                                                               |
| `importReturn`  | `dto` (retorno-ancoragem cru)                                             | Espelha o handler de retomada (referência L1362–1383): tudo TRAVADO, spans de `confirmed_span`, flags reaplicadas, cursor em frases |
| `export`        | `artifacts: ["manifesto"?, "retorno"?, "relatorio"?]`                     | Captura `buildManifest`/`buildReturn`/`buildMapReportMd` serializados                                                               |

Notas de fidelidade (comportamentos da referência que os casos exercitam):
slots não travados ocupam `P#`/`PT#`; `confirmFrase` NÃO checa `pendingStart`;
flags exportam mesmo com a frase reaberta; o fluxo guiado alcança o Mapeamento
com zero frases (`sceneDone` com `forceEmpty`); import de retorno não valida
manifest. Detalhes nas issues E1.

## Layout

```
cases/*.json      scripts de decisão (este arquivo documenta o vocabulário)
expected/<caso>/  goldens gerados da referência — COMITADOS, nunca editados à mão
generate.mjs      driver Playwright (geração e --verify)
pcm.ts            gerador de PCM (TS) + vetores testados em pcm.test.ts
registry.ts       replayers de domain/contracts (as issues E1 registram aqui)
golden.test.ts    o runner byte-diff (job de CI `golden-harness`)
```
