# Task 1: Create the pure analyzer

Create `src/playability.mjs` and `test/playability.test.mjs`.

`analyzePlayability(data)` consumes normalized `name`, `description`, `personality`, `scenario`, `first_mes`, and optional `character_book.entries`, and returns:

```js
{
  band: "strong" | "developing" | "thin",
  links: [{ cause, behavior, consequence, evidence }],
  tensions: [{ statement, evidence }],
  greetingCoverage: { matchedAnchors, unusedAnchors },
  findings: [{ type, title, detail, evidence }],
  suggestions: [{ field, title, reason, draft, evidence }],
}
```

Requirements:

- All evidence must be exact source text.
- Repetition must not create additional links.
- Headings, metadata, character names, placeholders, and common words cannot create greeting-anchor matches.
- Use local bounded patterns for causal/history (`because`, `after`, `due to`), behaviour/boundary (`refuses`, `keeps`, `avoids`, `jokes`, `helps`), consequence/emotion (`so`, `which makes`, `fears`, `regrets`), and explicit tensions.
- Return no signal if the text cannot support it. Do not invent card facts.
- Follow strict TDD: add tests, run them and record the expected red failure, then implement minimal code and run focused plus full suites.
- Do not modify existing source files in this task.

Required test coverage:

1. A compact causal card yields evidence for a link and a non-thin band.
2. A repeated flat trait list has zero links and a thin band.
3. Headings, biography metadata, and character-name-only greeting text create no greeting match.
4. Every finding has non-empty evidence.
