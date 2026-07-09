# Colar de Sons — Sound Necklace

App web ear-first para segmentar histórias orais em cenas e frases (colar de contas de
áudio), classificá-las contra a ontologia de Rute e ancorar respostas de sentido por voz.
Implementação completa do zero — a referência v1 (`docs/reference/index.html`) é só o
contrato executável de comportamento. **Leia `CLAUDE.md` e `docs/architecture.md` antes
de codar.**

## Comandos

```bash
pnpm install            # Node >= 22.12 (fnm use 22)
pnpm dev                # Vite dev server
pnpm typecheck          # tsc --noEmit (strict)
pnpm lint               # eslint + prettier --check
pnpm depcruise          # fronteiras de camadas (dependency-cruiser)
pnpm test               # vitest unit+dom com cobertura por camada
pnpm test:browser       # organismos críticos em Chromium real (playwright install chromium)
pnpm golden             # golden harness — o portão de merge
```

## Gates obrigatórios (CI, todos required)

`golden-harness` · `typecheck` · `lint` · `depcruise` · `test` — detalhes e regras
anti-burla em `CLAUDE.md` (Quality gates). Nenhum PR mergeia vermelho.

## Trabalho

O backlog vive no Linear (projeto **Sound Necklace**, milestone **MVP**). Uma issue =
um branch = um PR pequeno; o corpo da issue é o brief completo. Issues
`contract-critical` param para revisão humana; `loop-ready` mergeiam em CI verde.
