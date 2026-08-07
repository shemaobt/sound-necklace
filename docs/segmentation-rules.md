# Segmentation rules — scene and phrase are ONE model

**Status:** owner decisions (2026-07), reached by iterating on the live prototype.
Where they diverge from `docs/reference/index.html` or the original PRD v2, **these
rules win** for segmentation interaction (scene and phrase). Byte-identity with the
reference (the golden harness) is preserved — see "Why this stays golden-safe".

**Provenance — read this before "restoring fidelity" to the reference.** The
reference is the source of truth for domain, contracts and artifacts; segmentation
INTERACTION is the documented exception, and the divergences here are not drift. The
Pac-Man drag (rule 3) and remove-with-absorption (rule 4) were **recommended by the
system's author**, confirmed by the owner on 2026-08-07; rule 1's listen-from-the-start
is the owner's own decision and is what the owner expects when clicking the first bead.
Reverting any of them to `cordInteraction` is a product decision, never a bug fix.

**Single principle:** **scene** segmentation (Escuta 2 / Cortar) and **phrase**
segmentation (Segmentação) behave **identically**. Every rule below holds for both,
swapping "scene↔phrase" and "necklace↔parent-scene". If they ever differ, it's a bug.

Vocabulary: a **segment** is a scene (inside the necklace) or a phrase (inside the
parent scene). The **parent** is the necklace (for scenes) or the active productive
scene (for phrases). Beads are the coordinate system; a segment is an inclusive
`span {s, e}`. The **frontier** is the locked start of the next segment (`max locked
end + 1`, with the phrase first-phrase back-reach of PRD §6.4).

---

## 1. Playback while segmenting

The segment's **start is fixed at the frontier** (pre-anchored). The user only ever
chooses the **END**. One bead = one action:

- **Defining a segment (not yet confirmed):**
  - Click the **start** bead (the frontier) → **LISTEN**: play from the start
    forward to the parent end (the story end for a scene, the scene end for a
    phrase). The selection is untouched — this is "listen to it again".
  - Click **any other** bead → set the segment's **END** to that bead (the start
    stays at the frontier). Then, based on the playhead: if the audio has **already
    reached** that bead → **STOP**; otherwise → **keep playing** (do not interrupt).
- **A confirmed (locked) segment:** click any of its beads → play **FROM that bead**
  to the segment's end. Per-bead key: clicking a **different** bead jumps there;
  clicking the **same** bead pauses/resumes in place.
- **Editing a confirmed boundary** (dragging the end): play a preview from **~4 beads
  before** the new limit to **~3 beads after** it.

The listen/set-end/transport playbacks are **keyless** (`player.play`) — the glowing
head then pauses them via `stop`; a confirmed-segment playback carries a key
(`player.toggle`) and pauses/resumes in place.

_Divergences from the reference:_ the two-click "single-bead → range → edge-nudge"
model of `clickBead` (§8.2) is replaced by the above; the scene used a per-bead
"play from tapped bead" and the phrase played "the whole phrase" — both now follow
rule 1 uniformly.

## 2. The click only ever sets the END; the START yields to a drag

**Amended by the owner on 2026-08-06** — the earlier form of this rule ("the user
can never set the start") is revoked. What replaced it, and why:

The story audio is **raw**. Whoever recorded it sometimes stumbles, repeats, hesitates.
For that stretch not to become noise in the training, the user has to be able to leave
it **out of every scene and phrase**. Out is literal: not removed from the audio, not
skipped during playback, not excluded from the artifact — simply belonging to no
segment. Pushing the start forward is what opens that hole: the stretch between the
previous segment's end and the new start has no owner.

- A **click** still sets only the END. Nothing about the one-touch flow changes.
- The segment being defined also carries a drag handle on its **START**. Dragging it
  forward opens the hole; moving the start is a deliberate gesture, never a stray tap.
- Each locked segment still has **one** handle: its END.
- Clamps, and they are the ones `confirmPart` already charged: the start never goes
  **before the frontier** (overlapping the previous segment stays forbidden) and never
  **past the end** already chosen.
- With no end chosen yet, the selection is the degenerate `{frontier, frontier}` and
  the start drags the whole thing; the ceiling is then the parent's end.
- To move a **locked** segment's start, still drag the **previous** segment's end
  (rule 3) — the start handle belongs to the segment being defined.

## 3. Dragging a locked END is Pac-Man / tiled — the NEXT segment follows

(Between LOCKED neighbours there is still no gap: a hole is opened deliberately, by
rule 2, before the segment is locked — not as a side effect of adjusting a boundary.)

- Dragging a segment's end makes the **next segment follow** in both directions
  (its start becomes `newEnd + 1`):
  - **Shrink** (drag left) → the next **grows** to fill. **Never opens a gap.**
  - **Grow** (drag right) → the next **shrinks** (is pushed).
- **Clamps:** the dragged segment never goes empty (`newEnd ≥ start`); the next never
  goes empty (`newEnd ≤ next.end − 1`).
- **Last segment** (no next): its end grows/shrinks **freely** to the parent end
  (necklace end / scene end). Shrinking leaves the tail to be cut next.
- After every drag the pending slot is **re-anchored** on the new frontier
  (`primePart` / `primeFrase`), else the next click would close at the old seam.

## 4. Removing a segment — the NEXT one ABSORBS the space

- Removing a segment **from the middle** → the **next segment** (the locked one with
  the smallest start after the removed one) stretches **its start back** to the
  removed segment's start, swallowing the space. **No gap is left.**
- With no next (the last was removed), the space is left to be re-cut.
- The **Remover** button exists on both the scene chip and the phrase chip.

---

## Where it lives in the code

| Rule | Domain (pure) | Composed in the UI |
|---|---|---|
| 2 — start drag | `dragSelectionStart` (@/domain/selection.ts) | the `START_HANDLE` drag handle (@/ui/pages/cut/cutting.ts, wired in cut and phrases) |
| 1 — playback | `clickBead` returns the intent (`transport`/`listen`/`set-end`), @/domain/selection.ts | `playClick(player, action, parentEnd, head)`, `playEditWindow`, `playLockedSceneAt`/`playLockedPhraseAt` (@/ui/pages/cut/cutting.ts, pages) |
| 2 — end-only drag | — | `dragHandles` only at the end (@/ui/pages/cut, @/ui/pages/phrases) |
| 3 — Pac-Man + re-anchor | `dragSceneBoundary` (@/domain/seam.ts), `dragPhraseBoundary` (@/domain/phrases.ts) | `primePart(dragSceneBoundary(...))` / `primeFrase(dragPhraseBoundary(...))` |
| 4 — remove + absorb | `removePart`/`removeFrase` (PURE, reference-faithful) + `absorbNextScene`/`absorbNextFrase` | `absorbNextScene(removePart(...), gapStart)` / same for phrase |

## Why this stays golden-safe

The golden harness diffs byte-for-byte against `reference/index.html` and replays the
pure domain functions directly. The functions the golden touches stay
**reference-faithful**:

- The golden **does not use `clickBead`** — its `cutScene`/`phraseSelect` steps set
  `selection` directly (@/tests/golden/registry.ts). So the click model, and now
  `dragSelectionStart` with it, is free to change (verified: golden 16/16, expected
  files untouched). A hole in the cord needs no new contract either: the artifacts
  describe the spans that EXIST, and never claimed the spans tile the story.
- `removePart` / `removeFrase` **do not absorb** — absorption is a **separate** step
  (`absorbNextScene` / `absorbNextFrase`) composed **only in the UI**, outside the
  golden's scope, just like the post-drag re-anchor.
- `dragSceneBoundary` / `dragPhraseBoundary` are post-reference features (ENG-342),
  exercised by no golden case — free to evolve.

Result: all of these rules are **golden-safe**; the golden stays 16/16 and
byte-identical to the reference. Never "regenerate" the expected output to accommodate
one of these rules — if the golden goes red, the change is in the wrong place (it
belongs in the UI, not in the pure function).
