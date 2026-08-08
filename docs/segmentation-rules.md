# Segmentation rules — scene and phrase are ONE model

**Status:** owner decisions, and rule 1 changed TWICE on 2026-08-07. Morning: _"the
necklace's behaviour for scene/phrase segmentation stays strictly identical to the
reference"_ — the listen/set-end model of 2026-07 was revoked and `cordInteraction`
restored verbatim. Evening, after running the app: the pre-anchoring was dropped and
playback made continuous, because strict fidelity left the listener hearing only the
extremities. Rule 1 below is the current, third form. Byte-identity with the reference
(the golden harness) is preserved throughout — see "Why this stays golden-safe".

**Provenance — read before changing any of this.** `docs/reference/index.html` is the
source of truth for the necklace's DATA and rules; the segmentation INTERACTION is the
documented exception, and every divergence here is deliberate and dated. The Pac-Man
drag (rule 3) and remove-with-absorption (rule 4) stay because **the system's author
recommended them**. Rule 1's three beats are the owner's design, reached by using the
app. Anything NOT named here as a divergence should match the reference; if it does
not, that is a bug, not a preference.

**Single principle:** **scene** segmentation (Escuta 2 / Cortar) and **phrase**
segmentation (Segmentação) behave **identically**. Every rule below holds for both,
swapping "scene↔phrase" and "necklace↔parent-scene". If they ever differ, it's a bug.

Vocabulary: a **segment** is a scene (inside the necklace) or a phrase (inside the
parent scene). The **parent** is the necklace (for scenes) or the active productive
scene (for phrases). Beads are the coordinate system; a segment is an inclusive
`span {s, e}`. The **frontier** is the locked start of the next segment (`max locked
end + 1`, with the phrase first-phrase back-reach of PRD §6.4).

---

## 1. Clicking and playback while segmenting — three beats

**Rewritten on 2026-08-07 (evening) by owner decision, with the app running.** This
replaces the `cordInteraction` restoration made earlier the same day; what survives of
it is the NEAREST-boundary choice (L578–582) and the clamp between frontier and
necklace end (L566–567). The reason was an ear-first one: with the slot pre-anchored
and `playEdge`, whoever is cutting only ever heard ~1 s around boundaries whose
position they did not know yet. Now the story RUNS while they decide.

- **No active anchor** (Escuta) → the tap plays that bead. _(Divergence: the reference
  does nothing here. Kept because CLAUDE.md requires "bead click plays the bead" — the
  Escuta is not segmentation.)_
- **Defining a segment.** The slot arrives EMPTY — there is no pre-anchoring:
  - **1st click** → marks the **START** there and the audio **runs from it** to the
    parent end (story end for a scene, scene end for a phrase).
  - **2nd click** → closes the segment. The audio **stops if the playhead already
    passed** the marked end, and **keeps going if it has not** — marking the end early
    must not punish someone who is still listening.
  - **From the 3rd on** → moves the **nearest** boundary (the start included). Ties go
    to the start (`<=`). **Audio already running INSIDE the resulting stretch is not
    interrupted** — restarting from the beginning was waste the owner reported on
    2026-08-07: _"a reprodução não chegou no limite novo, então deveria continuar"_.
    Only when the playhead sits outside the stretch (or nothing is playing) does the
    UI sound anything, and what it plays is the **stretch that changed hands** — from
    the boundary's old position to its new one. Growing plays what the scene GAINED,
    shrinking plays what it LOST. The scene has already been heard; replaying it is
    the other waste the owner named.
  - Tapping a boundary **without moving it** is not an adjustment — it replays the
    whole stretch. That is what stands in for the reference's `▶ tocar este pedaço`
    button (`playSel`, L262) that ENG-291 removed from these stations.
  - The click is clamped between the frontier and the necklace end (L566–567), so a
    click before the seam saturates at it.
- **A confirmed (locked) segment:** click any of its beads → play **FROM that bead** to
  the segment's end; the same bead pauses/resumes. _(Divergence: the reference plays
  the whole segment from a ▶ button per card, and our listener stations carry no list.)_
- **Editing a confirmed boundary** (dragging the end): preview from **~4 beads before**
  the new limit to **~3 beads after** it. Post-reference (ENG-342).

The instruction line names BOTH beats at once and does **not** change on the click:
"Toque no colar onde esta cena **começa e termina**." Swapping the text at the moment of
the tap is text competing with the sound — §9.3, and `oral-mode.spec.ts` fails on it.
One short line, both beats, no flicker.

Hover keeps the reference's edge dwell (280 ms, ±1 bead, L584–597) — **but only in
SILENCE**. Owner decision, 2026-08-07, after it hijacked the click's audio again: with
sound in progress, the sound wins, whatever that sound is (the delta, the scene, the
story). A paused playback counts as silence, since nothing is sounding. The rule is
about precedence, not about where the pointer happens to be — which is why it replaces
the pointer-position suppressions of #164 and #172. The click does not cancel the dwell;
the dwell simply refuses to interrupt.

**Cost of dropping the pre-anchoring, stated plainly:** the start now comes from a
click, so an ACCIDENTAL gap between scenes is possible. Contiguity used to be free —
the start was always the seam. It is now a thing the user can get wrong, and the
deliberate gap of rule 2 is no longer distinguishable from an imprecise click.

## 2. The START yields to a drag — that is how a stretch is left out

**Amended by the owner on 2026-08-06**, and again on 2026-08-07 (see the last bullet).
The original form of this rule ("the user can never set the start") is revoked. What
replaced it, and why:

The story audio is **raw**. Whoever recorded it sometimes stumbles, repeats, hesitates.
For that stretch not to become noise in the training, the user has to be able to leave
it **out of every scene and phrase**. Out is literal: not removed from the audio, not
skipped during playback, not excluded from the artifact — simply belonging to no
segment. Pushing the start forward is what opens that hole: the stretch between the
previous segment's end and the new start has no owner.

- The segment being defined carries a drag handle on its **START**. Dragging it forward
  opens the hole; that gesture is what this rule is for.
- **Since 2026-08-07 the click can also move the start** (rule 1, nearest boundary), so
  a click behind the dragged start re-anchors it at the seam and **closes the hole**.
  That is the reference's behaviour and the price of restoring it: opening the hole is
  the drag, keeping it is not clicking behind it.
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
| 1 — click + playback | `clickBead` returns the intent (`transport`/`run`/`set-end`/`range`), @/domain/selection.ts | `playClick(player, action, parentEnd, head)`, `playEditWindow`, `playLockedSceneAt`/`playLockedPhraseAt` (@/ui/pages/cut/cutting.ts, pages) |
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
