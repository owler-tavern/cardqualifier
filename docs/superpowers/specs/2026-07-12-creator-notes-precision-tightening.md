# Creator Notes Precision Tightening — Design

**Status:** proposed, pre-implementation
**Date:** 2026-07-12
**Depends on:** creator-notes intent gate (`src/creator-notes.mjs`,
`classifyCreatorNotes`) — shipped on `feat/bulk-evaluation`.
**Sequencing:** optional follow-up. Only pick this up if promo/junk leaking
into the AI intent payload (and the +2 score) is judged worth the added
complexity. The current forgiving default is a deliberate design choice, not a
bug — this slice trades some of that forgiveness for precision.

## 1. Problem

`classifyCreatorNotes` currently lets clearly-promotional notes through as
**substantive** whenever they either (a) contain a single common intent word,
or (b) simply carry two or more words of prose that dodge the junk patterns.
Two confirmed cases:

```
"Join my Discord for more context and updates!"  -> substantive ("states intent": context)
"Check out my other stuff, dark vibes only lol"  -> substantive ("meaningful prose remains")
```

Both are pure promo. In case (a) a single broad word (`context`, `dark`,
`model`, `voice`, `trigger`, `drama`, `relationship`) short-circuits the whole
classifier before junk-stripping runs (`INTENT_RE.test(raw)` at
`src/creator-notes.mjs:32`). In case (b) the note has no junk markers the
current `JUNK_RE` list recognises ("check out my other stuff", "vibes only
lol"), so the lean-substance fallback (`words.length >= 2`,
`src/creator-notes.mjs:39`) admits it.

### Why this is not already fixed

During review we tried the obvious small fix — deleting `dark`/`context` from
`INTENT_WORDS`. It doesn't work: with the short-circuit gone, both notes fall
straight through to the `words.length >= 2` fallback and pass anyway, only with
a different `reason`. So trimming the word list removes legitimate tone signal
for **zero** behavioural change. The leak is a property of the forgiving
fallback, not the word list — fixing it means changing documented behaviour,
which is why it belongs in its own reviewed slice rather than a patch.

### Cost of doing nothing

- Promo text is injected into the AI-review payload as "the creator's intent,"
  so the reviewer may try to make the card "deliver on" a Discord plug.
- Junk notes earn the +2 Metadata-hygiene bonus they were meant to lose.

Both are low-severity (the AI reviewer is robust to a stray promo line, and +2
of 100 is small), which is exactly why this is a *proposed* follow-up, not a
blocker.

## 2. Goal

Raise precision — reject obvious promo/junk that currently rides the forgiving
fallback — **without** regressing recall on genuine borderline prose. The
existing tests that assert borderline prose leans substantive
(`"A cozy little seaside tale."`, `"Grumpy retired mercenary."`) MUST stay
green. Non-Latin prose MUST stay substantive (already covered by
`test/creator-notes.test.mjs`).

### Success criteria

- The two confirmed promo cases classify as **junk**.
- Every existing `test/creator-notes.test.mjs` assertion still passes.
- The gate stays a single pure, total, dependency-free function.
- Borderline default remains "lean substantive" — we tighten the *junk* signal,
  we do not raise the prose-length bar in a way that drops real short notes.

### Non-goals (YAGNI)

- Graded / line-level stripping (keep the good sentence, drop the promo one).
  Classification stays binary.
- AI-based classification. Still deterministic heuristic only.
- A perfect promo detector. We target the common, obvious cases; some promo
  will still leak, and that is acceptable.
- Reworking scoring or the AI intent instruction — this slice only changes what
  `classifyCreatorNotes` returns; both consumers already branch on
  `.substantive`.

## 3. Approach

Two complementary tightenings, both in `src/creator-notes.mjs`. Prefer to
implement and measure them independently so each can be kept or dropped on its
own evidence.

### 3a. Stop short-circuiting on the vaguest intent words

Split `INTENT_WORDS` into two tiers:

- **Strong** signals that may short-circuit on the raw text (unambiguous intent:
  `genre`, `nsfw`, `sfw`, `roleplay`, `slow-burn`, `slice of life`,
  `system prompt`, `jailbreak`, `preset`, `temperature`, the named genres, …).
- **Weak** signals that only count *after* junk-stripping, and only alongside
  surviving prose (`dark`, `context`, `model`, `voice`, `trigger`, `drama`,
  `relationship`, `dynamic`, …).

So `"Join my Discord for more context and updates!"` no longer short-circuits;
`context` is weak, and after the fallback path evaluates the residue it should
land on junk (see 3b). `"Best with a Claude model and low temperature."` still
passes on the strong `temperature` signal.

### 3b. Add the missing promo patterns to `JUNK_RE`

The residue for `"Check out my other stuff, dark vibes only lol"` survives
because no junk pattern matches it. Add promo/CTA phrase patterns:
`check (it/them/my ... )? out`, `other (stuff|cards|work)`, `only lol`,
trailing-filler interjections (`lol`, `haha`, `uwu`), and generic solicitation
verbs (`join`, `support me`). After stripping, the residue must clear the same
`words.length >= 2` bar — so a note that is *only* promo collapses to junk,
while a note mixing promo with real description keeps its description and passes.

Keep every pattern data-driven (arrays at the top of the module) so the lists
stay tunable and testable, matching the existing style.

## 4. Testing

Add to `test/creator-notes.test.mjs`:

- The two confirmed promo strings → `substantive: false`.
- A note mixing promo with real description → still `true`
  (e.g. `"Grumpy retired mercenary. Check out my other cards!"`).
- Regression guards: the existing borderline-prose and non-Latin cases stay
  `true`; the existing clear-junk and clear-intent cases are unchanged.
- A weak-word-only-in-junk case → `false`
  (`"Follow me for more dark content @author"`).
- A weak-word-with-real-prose case → `true`
  (`"A dark, guarded courier who trusts no one."`).

Run `node --test test/*.test.mjs` (the bare `test/` directory form is broken on
Node 24 — use the glob) and keep every suite green, including
`test/scorer.test.mjs` and `test/ai-review.test.mjs`, whose fixtures must not
flip.

## 5. Risk

The chief risk is a **recall regression**: tightening junk detection wrongly
drops a genuine short note. Mitigation — every new `JUNK_RE` pattern must be
anchored to promo-specific phrasing, never generic words that appear in real
descriptions, and the borderline-prose tests act as the tripwire. If a
tightening can't be made without failing an existing recall test, drop that
tightening; precision here is a nice-to-have, recall is not.
