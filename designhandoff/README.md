# Handoff: CardQualifier Redesign — "The Reading Room"

## Overview

Complete design + engine-architecture overhaul of CardQualifier, a local, explainable
quality checker for AI character cards (SillyTavern / Tavern V1–V2 formats). The
redesign replaces the current two-panel dashboard (competing panels for score,
decision, playability, suggestions, essence, AI review) with a single editorial
"review" flow: a written verdict, one merged improvement list, creator steering
controls, and a sequenced fix loop.

The engine change that powers the UI is specified in `unified-pipeline-spec.md`
(detectors → merger → drafter). **Implement the spec and the UI together** — the UI's
"one list" contract depends on the merger existing.

## About the Design Files

The `.dc.html` files in this bundle are **design references created in HTML** —
interactive prototypes showing intended look and behavior, NOT production code.
The task is to **recreate these designs in the existing CardQualifier codebase**
(vanilla JS ES modules, no framework, `index.html` + `styles.css` + `src/*.mjs`)
using its established patterns — plain DOM updates, one stylesheet, no build step.
Open each `.dc.html` in a browser to see and interact with the design
(`support.js` and `image-slot.js` must sit in the same folder; they are prototype
runtime helpers, not part of the design).

## Fidelity

**High-fidelity.** Colors, typography, spacing, and copy are final. Recreate
pixel-perfectly. The interactive behaviors in the prototypes (apply/undo, gate
unlock, tone switching, lens switching, art-hue sampling) are the intended
behaviors, implemented with prototype-grade code — reimplement them properly.

## Which file is which

| File | Role |
|---|---|
| `Unified Final.dc.html` | **PRIMARY. Implement this one.** The converged design: weak-card state with merged field cards, steering, gate, drafter. |
| `Weak Card A Gate.dc.html` | Reference for gate mechanics detail (lock states, re-analyze enablement). |
| `Weak Card B Merged.dc.html` | Reference for field-merge presentation detail (per-engine finding rows, field chips in verdict). |
| `Redesign D Model Lens.dc.html` | Reference for the STRONG-card state (score 89): same layout with 2 improvements + 1 note, session ledger, "How this was assessed" disclosure with per-criterion rows, per-model fix templates. |
| `Redesign A Studio.dc.html` | Reference ONLY for the AI-provider settings modal (click "Set up") and multi-card sidebar concept (not in scope for v1). |
| `unified-pipeline-spec.md` | Engine spec: Finding shape, merger rules, AI schema changes, migration order. |

## Screens / Views

### The Review (single page — `Unified Final.dc.html`)

Page shell: max-width 1080px centered, padding 40px 32px 64px, vertical stack with
36px gaps. Page background: `radial-gradient(1200px 500px at 50% -10%, #241d15, #1a1511 70%)`
on `#1a1511`.

**1. Top bar** — brand "CardQualifier" (Spectral 600, 19px) left; right: journey
pills Load / Review / Export (active pill: bg `#2a2318`, border `#4a4030`, number in
accent, mono 11px; inactive: transparent, text `#a5947a`/`#7d6f5b`), then a
"Reviewer ⚙" ghost pill button (border `#383024`) opening the provider settings
modal (see Redesign A Studio for modal spec).

**2. Verdict spread** — grid `240px 1fr`, gap 40px.
- Card art: 240×320, radius 14, border `1px solid #3d3427`,
  `box-shadow: 0 24px 48px rgba(0,0,0,0.45)`, rotated −1.2°. This is the uploaded
  PNG itself. Grade stamp overlaps bottom-right: 96px circle, 2px border in
  band color, rotated +6°, bg `rgba(26,21,17,0.92)`; score in Spectral 600 31px,
  band label 9.5px caps letter-spacing 0.14em.
- Band colors: score <50 `#e2897d` ("Not ready"), 50–69 `#e0a463` ("Mixed"),
  70–84 `#e0a463` ("Good"), ≥85 `#dfa04f` ("Excellent") — see Redesign D for the
  excellent state.
- Eyebrow: 12px caps 700 `#a5947a` — "The studio's verdict · one review, every
  engine behind it".
- Headline: Spectral 400, 38px (44px on strong cards), line-height 1.15,
  `text-wrap: pretty`. Written verdict prose, character-aware, updates with
  progress (see State Management).
- Body paragraph: 15.5px `#bfae95`, max 58ch.
- "How this was assessed" — collapsed `<details>`, border `#332b20`, bg `#1e1812`,
  radius 12. Summary 13px 600 `#a5947a`. Contents: per-criterion rows
  (label / note / points, mono points colored `#93cba4` pass, `#e0a463` weak) — full
  row layout in `Redesign D Model Lens.dc.html`. Closing note: "…rubric scores,
  playability and style advise, AI only drafts — nothing decided by a model."

**3. "Steer this review" panel** — single row, border `1px solid accent@0.25`,
radius 14, bg `linear-gradient(180deg, accent@0.06, accent@0.015)`, padding 15px 20px.
- Caps label in accent: "STEER THIS REVIEW".
- "Written for" segmented control (pill container border `#383024` bg `#1e1812`):
  Any model / Claude / GPT / Small local. Active: bg accent@0.16, text accentBright.
- "Take him/her" chips: As he is / Quirkier / Darker / Warmer. Active: bg
  accent@0.14, border accent@0.4, text accentBright.
- Right-aligned caption `#7d6f5b`: "retunes fixes and drafts · never the score".

**4. "Start here" — blocker field cards.** Section heading Spectral 500 23px +
inline caption. Cards: radius 14, padding 18px 22px; unresolved: border
`rgba(226,137,125,0.35)`, bg `linear-gradient(180deg, rgba(226,137,125,0.05), rgba(226,137,125,0.01))`;
applied: border `#3a4a38`, bg `#1e2119`.
- Header row: field pill (mono 12px, band color, bg `rgba(226,137,125,0.1)`,
  radius 6), title 15.5px 600, right-aligned leverage `~+N pts` (mono, band color).
- Finding rows: grid `92px 1fr`; engine tag 10.5px caps 700 colored by source —
  rubric `#e0a463`, playability `#9db8a0`, style `#a5947a`, drafter = accent;
  text 13px `#bfae95`.
- Fix box: border `#2c251b`, bg `#17120d`, radius 10. Label row: caps label
  ("Combined fix · resolves all N findings" / "AI draft · <reason> · resolves all N")
  + right hint "click to edit before applying" (`#55483a`). Content: editable
  textarea, mono 12.5px/1.55 `#d8cdb9`, transparent until focus (focus: border
  `#4a4030`, bg `#1a1410`, padding 8px).
- Action row: Apply button (ghost, border `#4a4030`, 38px min-height; applied state:
  bg `rgba(147,203,164,0.12)` text `#93cba4`, label "Applied ✓ (undo)");
  "Need a stronger draft? Ask the reviewer →" text button in accent (toggles to
  "Back to the plain template"); right caption "clears N findings at once".

**5. Gated queue** — dashed border `#383024`, radius 14. Locked: 🔒 +
"3 more improvements unlock after the blockers" (`#a5947a`), rows at opacity 0.45
(mono `~+N` delta, title, note). Re-analyze button: disabled bg `#2a241c` text
`#7d6f5b`; enabled (all blockers applied): bg accent, text `#241a0e`. After
re-analyze: ✓, title "Unlocked — N improvements now actionable" in `#93cba4`,
rows full opacity, panel bg `rgba(147,203,164,0.04)`.

**6. Polish drawer** — collapsed details, same style as assessment disclosure:
"4 polish notes — advice only, never counted".

**7. Session ledger** (strong-card state, see Redesign D) — dashed top border row:
caps "THIS SESSION", then chips: "89 · loaded" (neutral) → "+lorebook → 94" (green
`#93cba4` on `rgba(147,203,164,0.12)`) — one chip per user-caused apply, arrows
between. Right caption: undo reassurance copy.

**8. Export footer** — border `#383024`, radius 16, bg
`linear-gradient(180deg, #241d15, #1e1812)`. "Send him home" Spectral 500 20px;
caption "Art untouched — only the embedded text chunks change." Buttons:
"Download PNG" (solid `#ede3d3` on `#241a0e` text) + "JSON" ghost.

## Interactions & Behavior

- **Apply / undo**: toggling Apply updates card JSON (existing
  `applySuggestionToCard`), re-scores immediately, updates stamp + headline +
  ledger. Undo = one-level revert (existing behavior). Applying resets the
  re-analyze gate.
- **Gate**: Re-analyze is inert until every blocker is applied; clicking it unlocks
  the improvements list (locked rows become actionable cards on rescore).
- **Tone steering**: switching tone swaps the AI draft text in-place *only for
  drafts the user has requested* (cards showing "AI draft · …"); plain templates
  are unaffected. Draft label explains the steer ("leans into the deadpan logbook
  humor").
- **Model lens**: switching lens (a) swaps fix-template variants (gpt → secondary
  lorebook keys; small → ≤15-word entries), (b) adds/removes per-model advisory
  notes and the small-local "compress" advisory card, (c) never changes score or
  deltas. Persist lens+tone in localStorage alongside existing provider settings.
- **Art-tinted accent**: on PNG upload, downscale art to 32×32 canvas, average
  hue of pixels with HSL saturation >0.15 and lightness 0.12–0.9, weighted by
  saturation². Accent = `hsl(H, 58%, 62%)`, bright variant `hsl(H, 65%, 74%)`,
  alpha variants via hsla. Grayscale art (weight ≤2) → default amber `#dfa04f` /
  `#f0bd77`. Recompute contrast ≥ 4.5:1 against `#1a1511` and clamp lightness up
  if needed. Provide a "calm" toggle to disable per-card theming.
- **Editable drafts**: fix text is a textarea; user edits are what Apply writes.
- **Hovers**: ghost buttons brighten border to accent; text links brighten to
  accentBright. No animations required beyond default; keep transitions ≤160ms.

## State Management

- Existing: card text, lastResult, previousCardText (undo), sourcePng, provider
  settings. New: `targetModel`, `creatorDirection` (persisted), `reviewPlan`
  (merger output), per-card `appliedFindingIds`, `gateOpen`, session ledger array
  (score events this session), `artHue`.
- Verdict headline is derived copy: template per band + progress
  ("Two fields block everything — start there." → "One blocker down…" →
  "Both blockers cleared. Re-analyze to unlock the queue.").

## Design Tokens

Colors (dark, warm):
- bg `#1a1511`, bg-raised `#241d15`→`#1e1812` gradients, card `#211b14`,
  inset `#17120d`
- borders: `#332b20` (default), `#383024` (dashed/gate), `#2c251b` (inset),
  `#3d3427` (art), `#4a4030` (buttons)
- text: `#ede3d3` (primary), `#bfae95` (body), `#a5947a` (muted), `#7d6f5b`
  (faint), `#55483a` (hints)
- accent (default): `#dfa04f`, bright `#f0bd77` — dynamic per card art (see above)
- semantic: good `#93cba4`, warn `#e0a463`, bad `#e2897d`
- engine tags: rubric `#e0a463`, playability `#9db8a0`, style `#a5947a`,
  drafter = accent

Typography (Google Fonts):
- Spectral (300–600, italics) — display/headlines/stamps/blockquotes
- Instrument Sans (400–700) — UI
- IBM Plex Mono (400–500) — scores, deltas, field pills, drafts, JSON
- Scale: 38–44px headline, 23–24px section (Spectral 500), 15.5–16px body,
  13–13.5px UI, 12–12.5px captions, 10.5–11px caps labels (letter-spacing
  0.07–0.12em), mono 12.5px drafts.

Radii: 14 (cards), 10–12 (insets/disclosures), 16 (export), 999 (pills/chips), 6
(field pills). Shadows: art `0 24px 48px rgba(0,0,0,0.45)`; stamp
`0 12px 28px rgba(0,0,0,0.4)`.

## Screenshots

`screenshots/` — visual ground truth: `01/02/03-unified-final.png` capture the weak
card's three states (initial → both blockers applied → gate unlocked);
`strong-card.png` is the score-89 state with steering and session ledger;
`weak-card-gate.png` / `weak-card-merged.png` detail the gate and field-merge
mechanics; `settings-modal.png` is the provider settings modal to port.

## Assets

No image assets. Card art comes from the user's uploaded PNG. `image-slot.js` is a
prototype-only placeholder widget — in production the art is the uploaded card PNG
rendered directly.

## Known gaps — design these during implementation (or request designs)

1. **Empty / upload state** — the drop-zone screen before any card is loaded.
   Keep the Reading Room framing: centered drop target styled like the art frame
   (dashed border, rotated −1.2°), Load step active in the journey pills.
2. **Error state** — unparseable JSON / PNG without card chunks. Verdict area
   renders the error as prose ("I couldn't read this card…") + causes; no stamp.
3. **AI drafting loading state** — "Ask the reviewer" needs a pending state on the
   draft label (e.g. "The reviewer is reading…") and a friendly error path reusing
   `friendlyAiErrorMessage`.
4. **Settings modal in this visual language** — port the modal from
   `Redesign A Studio.dc.html` (structure/copy final) to the Reading Room palette.
5. **Responsive** — designs are 1080px-content desktop. Below ~860px: verdict
   stacks (art centered above prose), steering wraps to two rows, finding-row
   grid collapses to stacked label+text.
6. **Accessibility** — maintain existing focus-visible outlines; gate/lock state
   needs `aria-disabled` + live-region announcements on unlock and rescore;
   dynamic accent must keep 4.5:1 contrast (clamp).

## Engine work (required, see `unified-pipeline-spec.md`)

Migration steps 1–6 in the spec; land step 5 (AI schema change) together with
step 4 (UI rewire) — the schema change is breaking for the current server flow.
