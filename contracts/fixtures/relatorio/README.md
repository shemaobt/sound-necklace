# fixtures/relatorio — respostas por voz (PRD-derived)

**Origem: PRD v2 §10.4 — NÃO derivado da referência.** A referência
(`buildMapReportMd`, `docs/reference/index.html` L1155–1170) só serializa texto
digitado; ela não conhece respostas por voz. A regra abaixo é uma decisão de
produto do v2, portada em `contracts/relatorio.ts` e exercitada por estas
fixtures.

## Regra de célula da resposta

Para cada pergunta, a célula da resposta resolve nesta ordem:

1. **texto digitado** (após `trim`), se houver — o texto vence sempre (matéria-
   prima: a facilitadora digitou de propósito);
2. senão, o **caminho do recurso de voz** (`respostas/level{1,2,3}/…/<k>.webm`),
   se existir uma gravação para aquele slot;
3. senão, `_(sem resposta)_`.

Quando não há nenhuma gravação, a saída é byte-idêntica à referência.

## `voice-answers.json`

`recordedPaths` lista os caminhos de recurso que TÊM gravação — um por forma de
caminho (nível 1 por `k`, nível 2 por `part_id/k`, nível 3 por `prop_id/k`). O
teste monta um `Set` com eles e confirma os três shapes na saída, e que o texto
digitado vence quando ambos existem.
