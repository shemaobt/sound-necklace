# APPLICATION-SPEC — Colar de Sons (bridge for the Nori loop skillset)

This file exists because the Nori **loop** skillset requires it. It is a THIN REDIRECT —
the real specification lives elsewhere and is not duplicated here:

- **What the product is and every rule**: `CLAUDE.md` + `docs/PRD-colar-de-sons-v2.md` +
  `docs/PRD-redesign.md` + `docs/plano-de-acao-mvp.md` + the executable reference
  `docs/reference/index.html` (NEVER modify it).
- **Architecture & conventions**: `docs/architecture.md`.

## Task selection (OVERRIDES "determine an appropriate next commit")

Do NOT derive the next task from this file. The backlog is in **Linear**:

1. Use the Linear MCP tools. Project **Sound Necklace**, milestone **MVP**, team ENG.
2. Pick the **highest-priority eligible** issue: status `Todo`, ALL `blockedBy` issues
   `Done`, and carrying neither the `blocked-O8` nor the `needs-human` label.
3. **The issue body is the complete brief** (Goal, Context & specs, Scope, DoD,
   Out of scope). Read it plus the `docs/` sections it cites. Touch ONLY the files in
   its Scope.
4. Set the issue to `In Progress`. Name your branch with Linear's suggested branch
   name for the issue (rename the bootstrap branch: `git branch -m <linear-branch>`).
5. If the Linear MCP is unavailable or returns errors: **STOP and flag to the human.**
   Do not invent a task.

## Definition of done & merge policy (per issue)

- Every DoD checkbox must pass by RUNNING its command (`pnpm typecheck`, `pnpm lint`,
  `pnpm depcruise`, `pnpm test`, `pnpm test:browser` when relevant, `pnpm golden`).
  Node ≥ 22.12 required — use `fnm exec --using=22 -- pnpm <script>` if the default
  node is older.
- Open a PR (one issue = one branch = one small PR) and wait for CI with `gh pr checks`.
- **`loop-ready` issue + ALL checks green** → merge the PR (squash), set the Linear
  issue to `Done` with a one-line result + PR link.
  GitHub does NOT yet enforce required checks server-side (private repo, free plan) —
  treat `gh pr checks` all-green as a hard precondition for merging. Never merge red.
- **`contract-critical` issue** (all of E1 — touches `domain/` or `contracts/`) →
  open the PR, comment the results on the Linear issue, set it to `In Review`,
  and **END THE ITERATION WITHOUT MERGING**. A human reviews and merges.
- Blocked mid-issue (ambiguous spec, DoD unreachable in scope, harness red that you
  cannot fix without weakening it) → leave the PR open, comment the blocker on the
  issue, set it to `Blocked`, and end the iteration.

## Hard rules (from CLAUDE.md — read it every iteration)

Never lower a gate, delete/skip a failing test, or add ignore-comments to pass.
Never modify `docs/reference/index.html`. Never touch files outside the issue's Scope
(`**/docs.md` noridoc updates via the updating-noridocs skill are the ONE sanctioned
exception). No telemetry on listener behavior. All UI copy PT-BR.
