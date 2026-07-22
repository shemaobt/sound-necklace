# Segmentation rules — scene and phrase are ONE model

**Status:** owner decisions (2026-07), reached by iterating on the live prototype.
Where they diverge from `docs/reference/index.html` or the original PRD v2, **these
rules win** for segmentation interaction (scene and phrase). Byte-identity with the
reference (the golden harness) is preserved — see "Why this stays golden-safe".

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

## 2. Adjust a boundary — only the END drags

- Each locked segment has **one drag handle: its END**. The **start never** has a
  handle — the start is the seam (the previous segment's end + 1).
- Holds **whether it is the first or the last** segment. The first segment's start
  (bead 0 / the parent's start) is fixed.
- To move a segment's start, drag the **previous** segment's end.
- **The user can never set the start — only the end** (this is also rule 7 of the
  original brief; it falls out of rules 1 and 2).

## 3. Dragging is Pac-Man / tiled — the NEXT segment follows (no gaps)

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
| 1 — playback | `clickBead` returns the intent (`transport`/`listen`/`set-end`), @/domain/selection.ts | `playClick(player, action, parentEnd, head)`, `playEditWindow`, `playLockedSceneAt`/`playLockedPhraseAt` (@/ui/pages/cut/cutting.ts, pages) |
| 2 — end-only drag | — | `dragHandles` only at the end (@/ui/pages/cut, @/ui/pages/phrases) |
| 3 — Pac-Man + re-anchor | `dragSceneBoundary` (@/domain/seam.ts), `dragPhraseBoundary` (@/domain/phrases.ts) | `primePart(dragSceneBoundary(...))` / `primeFrase(dragPhraseBoundary(...))` |
| 4 — remove + absorb | `removePart`/`removeFrase` (PURE, reference-faithful) + `absorbNextScene`/`absorbNextFrase` | `absorbNextScene(removePart(...), gapStart)` / same for phrase |

## Why this stays golden-safe

The golden harness diffs byte-for-byte against `reference/index.html` and replays the
pure domain functions directly. The functions the golden touches stay
**reference-faithful**:

- The golden **does not use `clickBead`** — its `cutScene`/`phraseSelect` steps set
  `selection` directly (@/tests/golden/registry.ts). So the new click model is free
  to change (verified: golden 16/16, expected files untouched).
- `removePart` / `removeFrase` **do not absorb** — absorption is a **separate** step
  (`absorbNextScene` / `absorbNextFrase`) composed **only in the UI**, outside the
  golden's scope, just like the post-drag re-anchor.
- `dragSceneBoundary` / `dragPhraseBoundary` are post-reference features (ENG-342),
  exercised by no golden case — free to evolve.

Result: all of these rules are **golden-safe**; the golden stays 16/16 and
byte-identical to the reference. Never "regenerate" the expected output to accommodate
one of these rules — if the golden goes red, the change is in the wrong place (it
belongs in the UI, not in the pure function).
