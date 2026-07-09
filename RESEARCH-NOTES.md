# RESEARCH-NOTES — Colar de Sons

Cross-iteration technical notes for the loop. Read at iteration start; append concise,
durable findings (not narration) at iteration end. Delete entries that stop being true.

## Environment

- Node **≥ 22.12** mandatory (`.npmrc` engine-strict). Local machine default may be
  older — run everything as `fnm exec --using=22 -- pnpm <script>`.
- Browser tests need Chromium once: `pnpm exec playwright install chromium`.

## Stack gotchas (verified 2026-07-08, sources in docs/architecture.md §1)

- **Vite 8** bundles with Rolldown/Oxc: `build.rolldownOptions` (not `rollupOptions`),
  `oxc` (not `esbuild`). `@vitejs/plugin-react` 6.x already uses Oxc.
- **Vitest 4**: `test.projects` (workspace file removed); browser providers are separate
  packages (`@vitest/browser-playwright`, provider `playwright()` + `instances`);
  coverage config is root-only; V8 coverage counts files matched by threshold globs
  even when never imported by a test.
- **Zod 4**: import from root `"zod"` only (subpaths lint-banned); `z.strictObject`,
  `.extend()` not `.merge()`, two-arg `z.record()`, top-level `z.email()`.
- **TypeScript pinned `~5.9`**: TS 7 (native) is `latest` but typed lint doesn't
  support it yet. Do not bump.
- **Zustand 5**: selectors returning fresh references need `useShallow`.
- **Testing Library**: `@testing-library/dom` is an explicit peer dep; dom project has
  `globals: true` so auto-cleanup works.
- **Prettier is pinned exact** and `docs/` + `CLAUDE.md` + lockfile are in
  `.prettierignore` — a format pass once reformatted the frozen reference; never again.

## Reference / golden facts (byte-identity, verified against the reference source)

- Serialization: `JSON.stringify(x, null, 2)`, NO trailing newline; report `.md` =
  `lines.join("\n")` with exactly ONE trailing newline.
- Bead times are Numbers via `+(x).toFixed(6)` (JSON emits shortest form: `0.25`, `0.9`).
- `hashPCM` reads only `numberOfChannels`, `sampleRate`, `getChannelData(0)` — a plain
  object with a Float32Array works; sampleRate mixes only 2 low bytes; stride
  `max(1, floor(N/100000))`; `Math.round` (half-toward-+∞) for quantization.
- Load-bearing non-ASCII in the report: em dash U+2014, en dash U+2013 in
  `contas s–e`, middle dot U+00B7, curly quotes in the `tempo` note, `média` U+00E9.
- Reference quirks that MUST be mirrored (details in the E1 issue bodies): flags export
  independently of `locked`; dangling unlocked slots occupy P#s; `confirmFrase` does
  not check `pendingStart`; guided flow reaches Mapeamento with zero phrases;
  return-import does not warn on manifest mismatch (only delivery does).

## Determinismo numérico JS (verificado 2026-07-09, ENG-214)

- `pnpm` pode não estar no PATH do Node do fnm — usar
  `fnm exec --using=22 -- corepack pnpm <script>` (corepack resolve o pnpm
  pinado em `packageManager`).
- FNV-1a em JS exige `Math.imul` (o `*` ingênuo excede 2^53 e erra SILENCIOSAMENTE
  — passa em vetores curtos tipo `""`/`"a"` e falha em `"b"`/`"foobar"`).
  `^`/`Math.imul` são int32 por spec; `>>> 0` a cada passo (como a referência) ou
  só no final são equivalentes.
- `Math.round`: empate para +∞ (`-0.5 → -0`, `-1.5 → -1`) — spec-mandado; NÃO é
  `Math.floor(x+0.5)` em geral (duplo arredondamento). Vetores hand-computed em
  Python com `floor(x+0.5)` só valem quando o produto é um double EXATO
  (ex.: amostras float32 × 32767 — mantissa ≤ 39 bits).
- Float64→Float32Array = roundTiesToEven por spec (= `Math.fround` = `struct` do
  Python). `toFixed` e o formato de número do `JSON.stringify` (shortest
  round-trip) são determinísticos; Node e Chromium compartilham V8 ⇒ bytes iguais.
- Vetores de hash comitados em `domain/hash.test.ts` foram computados por
  emulação Python independente (script no comentário do teste) + goldens da
  referência (`manifest-only` → `fnv1a32:5a1b22f1`, `partial-bead` →
  `fnv1a32:1a884f38`).

## Estado de sessão / cenas (verificado 2026-07-09, ENG-216)

- Quirks da referência que o domain espelha: `enterLayer` (L930–935) escolhe o
  **último** índice destravado (`lu=k` sem break); reabrir a história (L677–680)
  limpa `confirmed`+`partsConfirmed`+`current` mas **NÃO** limpa
  `selection`/`pendingStart`; `confirmWhole` → `setMode("escuta")` →
  `enterLayer("parts")` → auto-`addPart` primado (afeta alocação de PT#);
  `confirmParts` seta `mode="triagem"` direto (gates de modo são ENG-219).
- `primePart` deixa `pendingStart=f` E `selection={s:f,e:f}` — o próximo clique
  cai no ramo de 2º clique (normaliza o range e zera `pendingStart`).
- Erros de validação no domain: códigos tipados + cópia PT-BR contratual
  (`{ code, message }`, mensagens em tabela `as const`) — o PRD v2 NÃO define
  códigos (grep confirmado), só as strings; a issue ENG-216 manda códigos
  tipados com a cópia como constante. Não usar throw para validação de fluxo.
- Efeito-como-valor: reducer de seleção retorna `{ state, play }` com
  discriminated union (`single-bead` | `range` | `edge` | `transport`) — padrão
  Elm/effects-as-data; o intérprete (Web Audio) fica nos adapters.
- Vitest 4 + V8: branches implícitos (`?.`, `??`, default params, `if` sem else,
  cada `case`) contam; cobrir os dois lados com testes; preferir eliminar
  código defensivo que o tipo já prova impossível a deixar branch morto.
- PRD §8.2 acrescenta à referência: sem ancoragem ativa o toque é transporte
  (tocar a partir da conta) — na referência o pointerdown só retorna; o reducer
  comunica isso com a ação `transport` e não muda o estado.

## UI atoms / camada visual (verificado 2026-07-09, ENG-215)

- **Protótipos normativos**: todo o estilo vive em objetos inline no
  `<script data-dc-script>` (classe `Component`) dos `.dc.html`. Para pearls/cord/
  head-glow/trail, "Ouvir no colar" é o arquivo autoritativo (o "Protótipo" é mais
  antigo: sem keyframes de glow, sem flag `reduced`, sem cord-fill).
- Fórmula da pérola: `radial-gradient(circle at 34% 30%, lit 0%, base 70%)`;
  head = `scale(1.18)` + anel `box-shadow` + `csHeadGlow 1.6s ease-in-out infinite`;
  dim = `opacity:.18`; scene-end = fill chato `deep`, `border-radius: 28%·size`,
  `scale(1.05)`. Easing da casa: `cubic-bezier(.2,.8,.25,1)` (micro-motion .12–.16s).
- **Divergência tokens×protótipos**: os protótipos usam `lit`/`deep` próprios por
  matiz (ex.: telha lit `#E8813E`, deep `#8F3701`), mas ui/tokens (ENG-213, congelado)
  fixou `lit = base`, `deep = darken30(base)` (≠ nos dois casos). Átomos só consomem
  o `PaletteEntry` recebido — resolver na camada tokens se o visual "flat" incomodar.
- Convenções de teste adotadas p/ atoms (projeto `dom`, jsdom): variantes/estados
  como `data-variant`/`data-state` (convenção Radix; asserção estável sem classe
  hasheada); sem `@testing-library/jest-dom` no repo — usar `getAttribute`/
  `textContent`; guarda anti-dígitos = `expect(container.textContent).not.toMatch(/\d/)`.
- **prefers-reduced-motion em jsdom**: jsdom não tem `matchMedia` nem avalia media
  queries — a guarda vai no CSS (opt-in: animações decorativas SÓ dentro de
  `@media (prefers-reduced-motion: no-preference)`) e o teste importa o css com
  `?raw` (projeto `dom` já tem `css: true`) e afirma que `animation`/`@keyframes`
  só ocorrem dentro do bloco guardado.
- Custom properties por instância (`style={{'--cds-…': v}}`): `React.CSSProperties`
  rejeita `--*` por design — augmentation restrita ao namespace `--cds-` num
  `.d.ts` de módulo (ui/atoms/cds-css-props.d.ts) resolve sem cast.
- Glifos: play/pause dos protótipos são SVG inline viewBox 24 (`M8 5v14l11-7z`;
  pause = 2 rects rx 1.4), nunca unicode. Glifo decorativo: `aria-hidden`; forma
  com significado (disco de confiança): `role="img"` + `aria-label`.

## Web Audio / engine de áudio (verificado 2026-07-09, ENG-217)

- `decodeAudioData` DESTACA o ArrayBuffer de entrada (passo do spec) — passar cópia
  (`bytes.slice(0)`) quando os bytes forem reutilizados; é por isso que a referência
  faz `arr.slice(0)`. Bytes corrompidos ⇒ DOMException `EncodingError`; buffer já
  destacado ⇒ `DataCloneError`.
- `AudioBufferSourceNode` é one-shot: segundo `start()` lança `InvalidStateError` —
  um nó novo por playback. `stop()` também dispara `onended`; a referência guarda
  `state.playing===src` dentro do onended para ignorar o evento do nó descartado.
- `ctx.currentTime` congela durante `suspend()` ⇒ progresso `t0 + (now() − ctxStart)`
  permanece correto através de pause/resume sem contabilidade extra; avança em
  quanta de 128 frames (~2,9 ms @ 44,1 kHz).
- `resume()` pode resolver a promise antes do relógio voltar a andar (Chromium bug 41302928) — smoke test deve observar `currentTime` avançando, não só o await.
- Chromium lançado pelo Playwright nasce com AudioContext `"running"` (autoplay
  policy não aplicada; Playwright #33590) — smoke headless funciona sem gesto.
- jsdom/node: sem `AudioContext` (jsdom #2900). jsdom TEM rAF (Vitest liga
  `pretendToBeVisual`); o projeto `unit` (node) NÃO tem rAF global — o engine
  injeta um transport `{now, requestFrame, cancelFrame, suspend, resume, start}` e a
  fixture avança tempo/frames manualmente. Mocks npm de Web Audio: mortos
  (web-audio-test-api arquivado) ou acoplados a standardized-audio-context — hand-roll.
- Vitest 4: `it.skipIf(cond)` aparece como skipped (↓) no reporter mas sem razão —
  razão visível vai no NOME do teste. Fake timers mockam rAF por default
  (`vi.advanceTimersToNextFrame()`), desnecessário com transport injetado.
- Semântica da referência portada na ENG-217 (call sites verificados): `playRange`
  NÃO seta `playingKey` — cliques de conta (`playRange(b,b)`) e `playEdge` tocam sem
  affordance de pausa; `setMode` (L1001) e `setReview` (L973) chamam `stopPlayback`
  ("mudar de modo para a reprodução"); `stopPlayback` durante pausa deixa o ctx
  suspenso — o `resume()` incondicional de `playRange` conserta no play seguinte;
  piso de duração `Math.max(0.02, t1−t0)`; após fim natural (onended), o mesmo key
  recomeça do início (o guard `playingKey===key && state.playing` falha).
- Depcruise: nenhuma regra proíbe `adapters/` → `tests/golden/pcm.ts` (só domain/
  contracts são banidos de tests/) — o brief da ENG-217 cita esse import de
  propósito para a fixture sintetizar o PCM dourado.

## UI molecules / camada de composição (verificado 2026-07-09, ENG-218)

- **Nenhum glifo lock/caderno/mic/download existe** no repo — só `PlayGlyph`
  (play/pause, filled) e `ShemaIcon` (marca). Molecules autoram os seus inline
  (Feather stroke, viewBox 24, `aria-hidden`+`focusable=false`, `currentColor`).
  Paths lift-áveis verbatim dos protótipos: cadeado
  `rect 4,10 16x10 rx2 + M8 10V7a4 4 0 0 1 8 0v3`; caderno
  `M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z`; download
  `M12 4v11 / M7 10l5 5 5-5 / M4 19h16`; check `M20 6L9 17l-5-5`.
- **Decisões de a11y (pesquisa web, APG/WCAG)**: escolha única = `role=radiogroup`
  - `role=radio` + `aria-checked` com roving tabindex (NÃO toggles com aria-pressed,
    NÃO `<ul>` de botões) — usado no `confidence-trio` (grupo completo, dono do
    roving+setas) e no `kind-card` (radio isolado; o organismo ENG-225 orquestra o
    grupo). Chip com ações = container `role=group`+`aria-label` com botões-IRMÃOS
    (nunca aninhar interativos — WCAG 4.1.2). Stepper = `<ol>/<li>` +
    `aria-current="step"`, não-focável, sem `<nav>`; texto sr-only p/ done/atual/futuro.
    Dots-como-atalho = `<button>` nomeado, atual com `aria-current="step"`.
- **Teste sem jest-dom**: consultar por papel+nome (`getByRole('radio',{name,checked:true})`);
  o filtro de papel `{checked}`/`{current:'step'}`/`{pressed}` já afirma estado sem
  matcher; payloads via `vi.fn()`+`toHaveBeenCalledWith`. Helpers CSS reusados de
  `ui/atoms/testing/css.ts` (import `../../atoms/testing/css` do teste da molécula).
- Molecules importam só `ui/atoms` (barrel), `ui/tokens` e React; irmãos por caminho
  direto (regra depcruise `atomos-e-moleculas-puros`). Não precisam de novo
  `cds-css-props.d.ts` (a augmentation `--cds-*` é global/ambient). Pergunta em
  Merriweather usa `var(--cds-font-quiet-voice)`. Trio emite tokens presentacionais
  `certeza|quase|duvida` (não `alta/média/baixa`) p/ ficar domain-free; a página mapeia.

## UI organisms — o colar / browser mode (verificado 2026-07-09, ENG-220)

- **Sem `vitest-browser-react` no repo.** O único browser test (`ui/browser-smoke.browser.test.tsx`)
  monta com `createRoot`/`flushSync` cru + APIs DOM. Reusar esse padrão nos
  `*.browser.test.tsx` do organismo (evita dep nova / mudança em package.json fora do escopo).
- **Eventos por coordenada**: `userEvent` (Playwright) NÃO aceita clientX/clientY e roda
  actionability checks que quebram com milhares de beads sobrepostos. Usar
  `el.dispatchEvent(new PointerEvent(type,{clientX,clientY,pointerType:'mouse',bubbles:true,...}))` —
  síncrono, determinístico; `getBoundingClientRect()` devolve geometria real no Chromium.
- **Dwell de 280ms**: fake timers funcionam em browser mode (`@sinonjs`), mas dão deadlock
  se misturados com `userEvent` (CDP). Como uso dispatch nativo (síncrono), posso
  `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(280)`. Fallback: `vi.waitFor` com timers reais.
- **Ilha imperativa (react.dev)**: seguro tocar SÓ atributos que o React não gerencia.
  Alternar um `data-*` que NÃO vem de JSX é seguro entre re-renders (a reconciliação só
  escreve/remove atributos vistos no JSX; nunca mexe no que não conhece). NÃO usar `class`
  gerenciada por `className` no JSX (React sobrescreve a string inteira no re-render).
  Chaves estáveis por bead → identidade de nó DOM preservada.
- **Sem re-render por frame**: memoizar o campo de beads (`React.memo`) com apenas props
  ESTRUTURAIS; `playbackHead` fica FORA delas e a iluminação roda num `useEffect` que escreve
  `data-play` via ref do container → mudar head não reconcilia os beads (identidade estável).
- **Listener único**: `useEffect` com `addEventListener('pointerdown'|'pointermove'|'pointerleave')`
  no container (não `onPointerDown` JSX, que o React delega na raiz). Mapear pointer→bead por
  geometria (`beadAtXY`: rect + `Z.slot`/`Z.row`) espelhando a referência L554–560 (clamp à janela).
  Contar via `vi.spyOn(HTMLElement.prototype,'addEventListener')` antes do render.
- **Janela = span da cena ativa** (prop `window {s,e}|null`): o organismo deriva o range de
  render `cena ± max(3, round(2/beadSec))` (referência L509), dim nos beads da margem, band
  tracejada sobre a cena; `beadAtXY`/posições usam `winS = cena.s − M` (o "window offset" da DoD).
- Geometria M (referência L484): `SIZES.M={slot:25,bead:18,row:31}`; `bpr=max(1,floor(W/slot))`;
  bead `left=col*slot+slot/2`, `top=6+row*row+row/2` (centro; wrapper com translate(-50%,-50%)).
  `drawBand` (L485–498) desenha retângulos por linha para banda de seleção (pad 3) e cena (pad 4).
- Convenções de camada: organismo pode importar `domain` (tipos) + `ui/tokens` + `ui/atoms`/`molecules`
  (barrels), nunca adapters (depcruise `organismos-sem-adapters`). Precisa do próprio
  `ui/organisms/index.ts`, `docs.md` e `minimalism.test.tsx` (§9.2: sem dígitos em texto/aria/title;
  `data-idx` interno é permitido). Augmentation `--cds-*` é global (não recriar).

## UI organisms — palco da conversa / guia (verificado 2026-07-09, ENG-221)

- **Reuso é a regra**: `conversation-stage` compõe moléculas/átomos existentes em vez de
  re-implementar — `QuestionCard` (pergunta em Merriweather + marcador de papel `role="img"`
  sem palavras + botão "Ouvir a pergunta" condicional ao `onListen`/`onSpeakQuestion` + slot
  `children`), `BeadRow` (fio de progresso: 1 `Pearl` por pergunta, `head`/`lit`/`unplayed`),
  `WaveformBar` (níveis via prop `height`), `Button` (`dark`/`ghost`, size `sm`). Só o glifo de
  microfone é SVG inline local (não há átomo de mic — extrair para `ui/atoms` só se um 2º uso surgir).
- **Máquina de estados do gravador dirigida por props** (`recorderState: 'idle'|'recording'|'recorded'`
  + `levels[]`), callbacks para fora (`onRecord/onStop/onPlay/onRerecord`, `onPrev/onNext`,
  `onSpeakQuestion`). O `MediaRecorder` NÃO vive no organismo — fica no adapter (ENG-244), ligado
  pela estação (ENG-249). Precedência de estado da conta: `current` vence `answered` (revisitada = `head`).
- **Padrão de variante por glob dentro de um componente** (doc de arquitetura §4, espelha as 3
  registries do shell mas escopado): `index.tsx` lê `import.meta.glob('./variants/*.tsx', {eager:true})`
  e um helper puro `pickVariantPath()` prefere `animated` sobre `static`, ANCORADO no basename
  (`/\/animated\.tsx$/`) — substring solto pega `*.test.tsx` por engano. Esta issue traz só
  `variants/static.tsx`; a ENG-232 acrescenta `animated.tsx` sem tocar nada. `import.meta.glob`
  é transformado pelo Vite em TODOS os projects do Vitest (unit/dom/browser) e o typing vem de
  `vite/client` (já em `tsconfig.types`).
- **Gravador é interaction-critical** (uma das 3 do CLAUDE.md) → teste de fluxo obrigatório em
  `*.browser.test.tsx` (Chromium real). Sem `vitest-browser-react`: `createRoot`/`flushSync` para
  render/re-render + `button.click()` nativo (o React 19 ouve na raiz, o click nativo borbulha e
  dispara o `onClick`). Botões do átomo `Button` não repassam props → alvo por texto no teste.
- **Guarda de digit-free escopada** (§9.2): o check "sem dígitos" cobre SÓ `.cds-conversation-stage-progress`,
  não o palco inteiro — a cópia da pergunta pode legitimamente conter dígitos. Movimento decorativo
  (pulso do mic idle) só sob `@media (prefers-reduced-motion: no-preference)`; guia estático sem movimento.

## Process

- The golden harness is the merge gate: placeholder until ENG-212, strict from ENG-238.
  `pnpm golden:generate` (once it exists) drives the UNMODIFIED reference via Playwright
  `page.evaluate` — never edit `docs/reference/index.html`.
- Integration points are add-a-file registries (stations / adapters `register.ts` /
  app addons / guide variants) — never edit another issue's files to wire yours.
