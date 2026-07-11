# Repair Queue draft apply verification

## Change

Repair Queue entries now keep their preview and `Apply` button when they provide a
`draft` instead of a `template`. Template-backed entries still show `Template`;
draft-backed entries show `Draft text`.

## Why there is no focused Node test

`src/app.mjs` directly initializes from the browser DOM at module load and the
repository has no DOM test dependency or browser test harness. The existing
`node --test` suite exercises the scorer and confirms that playability repairs
carry a `draft` and can be applied, but it cannot render or click the Repair
Queue without adding browser infrastructure outside this focused fix.

## Exact live-browser verification

1. Open `index.html` in a browser.
2. Paste this JSON into the card input and select **Analyze card**:

   ```json
   {
     "name": "Mara Venn",
     "description": "Mara protects old courier routes in the brass city.",
     "personality": "Warm but guarded, loyal but impatient with careless promises.",
     "scenario": "{{user}} meets Mara at a shuttered station during a dangerous dust storm.",
     "first_mes": "*Mara checks the locked door.* \"Can you hear anyone outside?\"",
     "mes_example": "<START>\n{{user}}: What happened?\n{{char}}: Mara watches the door.\n<START>\n{{user}}: Can I help?\n{{char}}: Not yet."
   }
   ```

3. In **Repair Queue**, locate **Connect a cause to a visible behavior**. It
   should show a **Draft text** disclosure containing text and an **Apply**
   button.
4. Select **Apply**. Confirm the status says the suggestion was applied and the
   targeted card field gains the displayed draft while the other fields remain
   unchanged.
5. Analyze a sparse card that produces a normal template-backed repair. Confirm
   its disclosure is still labeled **Template** and its **Apply** button works.
