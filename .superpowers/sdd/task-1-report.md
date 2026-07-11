# Task 1 report: pure playability analyzer

## Status

DONE

## Files changed

- `src/playability.mjs` — added the pure `analyzePlayability(data)` analyzer.
- `test/playability.test.mjs` — added Task 1 behavior coverage.

No existing source files were modified. No Git actions were performed.

## Implementation notes

- Builds links only when one local source passage contains a causal/history signal, a visible behavior/boundary signal, and a consequence/emotion signal.
- De-duplicates identical causal links, so repetition cannot add a further link.
- Extracts explicit tensions from locally stated contrast language.
- Uses only non-metadata, non-heading, non-name-only source content as greeting anchors; the greeting itself is never an anchor.
- Returns exact source passages as link, tension, finding, and suggestion evidence. When no source passage exists, it returns no finding or suggestion rather than fabricating evidence.
- Reads normalized `description`, `personality`, `scenario`, `first_mes`, and optional `character_book.entries[].content`.

## TDD record

### RED

Command:

```powershell
node --test test/playability.test.mjs
```

Observed expected failure before implementation:

```text
ERR_MODULE_NOT_FOUND: Cannot find module 'F:\Docker\Projects\CardQualifier\src\playability.mjs'
```

Exit code: `1`.

### GREEN

Focused command:

```powershell
node --test test/playability.test.mjs
```

Result: 4 passed, 0 failed.

Full-suite command:

```powershell
node --test test/*.test.mjs
```

Result: 42 passed, 0 failed.

## Self-review

- Correctness: checked the required compact causal, flat repetition, metadata/name-only greeting, and evidence cases.
- Readability: kept the analyzer self-contained with small helpers and no dependencies.
- Architecture: added a new pure module only; no existing application paths were changed.
- Security: no I/O, dynamic evaluation, network access, or secret handling.
- Performance: single bounded pass over supplied source passages; duplicate checks use sets.

## Concerns

None. The analyzer deliberately remains conservative: it returns no causal signal unless all three required local pattern categories occur in the same passage.

## Review follow-up: metadata filtering

### Fix

- Retained all non-empty source passages for causal-link and tension analysis, including passages with years or profession words.
- Kept heading/biography metadata exclusion only inside greeting-anchor qualification.
- Strengthened the greeting regression to use a non-name greeting containing matchable biography terms and assert both `matchedAnchors` and `unusedAnchors` are empty.
- Added a regression proving a passage containing both `2020` and `actress` still produces a causal link.

### RED

Command:

```powershell
node --test test/playability.test.mjs
```

Observed expected failure before the fix:

```text
retains causal analysis for biography-style text that contains a year or profession
AssertionError: Expected values to be strictly equal: 0 !== 1
```

Result: 4 passed, 1 failed; exit code `1`.

### GREEN

Focused command:

```powershell
node --test test/playability.test.mjs
```

Result: 5 passed, 0 failed.

Full-suite command:

```powershell
node --test test/*.test.mjs
```

Result: 43 passed, 0 failed.

### Follow-up self-review

- The broad metadata predicate is now used only by `isAnchor`, so it cannot discard causal or tension evidence.
- The analyzer remains pure and bounded, with no unrelated-file changes or new dependencies.

## Review follow-up: greeting anchor tokens

### Fix

- Removes `{{...}}` placeholder forms before anchor tokenization, so `{{char}}` and `{{user}}` cannot create overlap.
- Expands the common-word policy to exclude ordinary greetings and conversational filler, including `hello`, `there`, `hi`, `hey`, and `welcome`.
- Keeps uncommon, source-grounded multiword matches available for greeting coverage.

### RED

Command:

```powershell
node --test test/playability.test.mjs
```

Observed expected failures before the fix:

```text
does not match greeting anchors through character placeholders
actual: [ '{{char}} helps {{user}} at the archive.' ]
expected: []

does not treat ordinary greeting words as greeting anchors
actual: [ 'Mara says hello there every morning.' ]
expected: []
```

Result: 6 passed, 2 failed; exit code `1`.

### GREEN

Focused command:

```powershell
node --test test/playability.test.mjs
```

Result: 8 passed, 0 failed.

Full-suite command:

```powershell
node --test test/*.test.mjs
```

Result: 46 passed, 0 failed.

### Follow-up self-review

- Placeholder removal happens before word extraction, so neither braced placeholder text nor its inner token participates in overlap.
- The new common-word exclusions are limited to greeting-anchor tokenization; causal and tension analysis remains unchanged.
- The uncommon-anchor regression confirms that the filter has not suppressed meaningful two-word grounding.
