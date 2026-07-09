Following the Nori loop skillset workflow: work exactly ONE Linear issue this
iteration.

You are already inside a fresh git worktree on a disposable bootstrap branch
(created by loop.sh). Proceed as follows, on top of your AGENTS.md checklist:

1. APPLICATION-SPEC.md §"Task selection" replaces "determine an appropriate next
   commit": pick the highest-priority ELIGIBLE Linear issue (project Sound Necklace,
   milestone MVP; eligible = Todo + all blockedBy Done + no blocked-O8/needs-human
   label). Rename this branch to Linear's suggested branch name (git branch -m).
2. The issue body is the complete brief. Respect its Scope strictly.
3. Verify every DoD checkbox by running its command (use
   `fnm exec --using=22 -- pnpm <script>` if plain pnpm fails on engine check).
4. Follow APPLICATION-SPEC.md §"Definition of done & merge policy":
   loop-ready + all `gh pr checks` green → squash-merge + issue Done + log line in
   CURRENT-PROGRESS.md (committed to main via the merged PR — append it BEFORE
   opening the PR). contract-critical → PR + comment + In Review + STOP (no merge).
5. Append durable findings to RESEARCH-NOTES.md (same commit as your work).
6. If nothing is eligible (all remaining issues blocked/needs-human/in review):
   say so explicitly, do NOT update memory files about it (one idle note is
   enough; repeated recounts are noise), and end the iteration without
   inventing work — with the literal marker `[LOOP-IDLE]` as the last line of
   your final message (the outer loop reads it to back off instead of
   re-scanning every few minutes).
