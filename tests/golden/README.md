# Golden harness — o portão de merge

Reproduz conjuntos roteirizados de decisões através da referência executável
(`docs/reference/index.html`, INTOCÁVEL) e do `domain/`+`contracts/`, e compara os
artefatos **byte a byte**. Nenhum PR mergeia vermelho. Se a sua mudança quebra o
harness, a mudança está errada — não o harness.

Estado atual: **placeholder** (`placeholder.mjs`, verde com aviso).
A infraestrutura real chega na **ENG-212** (formato dos scripts de decisão, driver
Playwright via `page.evaluate` com PCM sintético LCG, goldens comitados em
`expected/`, runner byte-diff, `golden:verify`); o modo estrito na **ENG-238**.

Layout alvo (definido na ENG-212):

```
tests/golden/
  README.md        ← formato dos scripts de decisão (vocabulário de passos)
  cases/*.json     ← scripts de decisão
  expected/<caso>/ ← goldens gerados da referência (comitados)
  generate.ts      ← driver Playwright sobre a referência (gera goldens)
  runner.ts        ← replay via domain/contracts + byte-diff
  registry.ts      ← replayers registrados pelas issues de domain/contracts
  pcm.ts           ← gerador de PCM sintético (LCG) — espelho TS do driver
```
