import test from "node:test";
import assert from "node:assert/strict";
import { analyzeStyle } from "../src/style-checks.mjs";

test("reports perspective mixing as an advisory", () => {
  const findings = analyzeStyle({ description: "She guards the archive.", first_mes: "I guard the archive.", mes_example: "{{char}}: I never leave." });
  assert.equal(findings.find((item) => item.id === "style.perspective")?.severity, "advisory");
});

test("reports negation-heavy behavioral rules", () => {
  const findings = analyzeStyle({ description: "Do not smile. Never trust strangers. Don't answer questions. Never forgive debts." });
  assert.ok(findings.some((item) => item.id === "style.positive-framing"));
});

test("reports unanchored personality traits", () => {
  const findings = analyzeStyle({ personality: "Brave, patient, and curious.", mes_example: "{{char}}: Hello." });
  assert.ok(findings.some((item) => item.id === "style.trait-anchoring"));
});
