# CardQualifier

CardQualifier is a local, explainable quality checker for AI character cards used by
SillyTavern, JanitorAI-style exports, and compatible Tavern card formats.

The goal is not to decide whether a character is "good taste". It checks whether a
card is likely to work well in roleplay:

- complete and valid card structure
- clear character identity and behavior
- useful scenario and greeting
- examples that teach voice
- efficient permanent-token footprint
- metadata and lorebook hygiene
- obvious quality hazards such as placeholder text, contradictions, and spammy tags
- local Playability Audit: connected causes, behaviour, unresolved tension, and greeting-to-card grounding

## Why this rubric

The Playability Audit is a local writing-quality heuristic. It shows evidence from the card and recommends repairs, but it does not predict a model's exact behaviour or change the overall score in this release.

Datacat is useful as a discovery/indexing reference, but its public pages do not
expose a clear scoring formula. CardQualifier uses an auditable rubric instead,
grounded in the fields that SillyTavern and Character Card V2 actually consume.

Primary format references:

- Character Card V2: `spec`, `spec_version`, nested `data`, advanced metadata,
  alternate greetings, and character books.
- SillyTavern character design: permanent prompt fields are name, description,
  personality, and scenario; first message and example messages strongly affect
  style but are not always permanent context.

## Use

Open `index.html` in a browser. Drop a `.json` character card or a compatible
`.png` card with embedded character data.

Supported input shapes:

- Character Card V1-style flat JSON.
- Character Card V2 JSON with `spec: "chara_card_v2"` and nested `data`.
- Nested exports with a recognized `data` object.
- Legacy/platform aliases such as `char_name`, `char_persona`,
  `world_scenario`, `char_greeting`, and `example_dialogue`.
- PNG cards with embedded `chara`, `character`, `ccv2`, `ccv3`, or `card`
  text chunks containing either direct JSON or base64-encoded JSON.

For quick verification of the scoring engine:

```powershell
node --test
```

## Guided review and optional AI drafting

After loading a card, CardQualifier presents a single Reading Room review:

- **Start here** groups the score-backed blockers into field cards. Each card
  includes the local evidence and either a real paste-ready local repair or a
  **Draft with reviewer** action. Rubric gaps do not get filler prose; use the
  reviewer to draft those from the card evidence. Local Playability repairs are
  the deterministic draft exception.
- **Written for** adjusts repair wording for Any model, Claude, GPT, or a
  small local model. **Take them** steers the draft toward the current voice,
  or a quirkier, darker, or warmer direction. Neither control changes the
  deterministic score.
- **Polish notes** keep playability and style advice visible without treating
  it as a score penalty. When blockers are resolved, re-analyze to unlock the
  remaining improvement cards.

Use **Draft with reviewer** or **Improve with reviewer** on a field card only
when you want model assistance. The reviewer receives that card's merged local
findings and may draft text for those finding IDs; it does not discover or
score issues.

## Reviewer settings

Run the local Node server when you want model-assisted card improvement:

```powershell
node server.mjs
```

Then open the displayed local URL and select **Reviewer** in the top bar. The
settings dialog lets you choose:

- `OpenAI`
- `OpenAI-compatible` providers such as local servers that expose `/v1/chat/completions`
- model name
- **Fetch models**, which asks the selected provider's `/models` endpoint and fills the model picker when credentials/base URL are available
- base URL for compatible providers
- API key, when the selected provider needs one

The app remembers provider, model, and base URL in this browser. It does not
store the API key; the key stays in the current page session and is sent only to
the local Node server for the selected field-card drafting request.

You can still prefill defaults with environment variables:

```powershell
$env:AI_PROVIDER="openai"
$env:AI_API_KEY="your_api_key"
$env:AI_MODEL="gpt-4.1"
node server.mjs
```

For an OpenAI-compatible provider or local server:

```powershell
$env:AI_PROVIDER="compatible"
$env:AI_BASE_URL="http://127.0.0.1:1234/v1"
$env:AI_MODEL="your-model"
$env:AI_API_KEY="optional_if_your_server_needs_it"
node server.mjs
```

The local server sends only the current card, deterministic score context, and
explicit anti-invention instructions to the selected provider.

## Score Bands

- `85-100` Excellent: rich, coherent, efficient, and immediately usable.
- `70-84` Good: usable with a few improvements.
- `50-69` Mixed: likely works, but important card-building pieces are thin.
- `<50` Weak: missing structure, voice, context, or too many quality hazards.
