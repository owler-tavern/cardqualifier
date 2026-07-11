import test from "node:test";
import assert from "node:assert/strict";
import { accentFromPixels } from "../src/art-accent.mjs";

test("uses a saturation-weighted hue from a solid color pixel fixture", () => {
  const result = accentFromPixels(new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]));
  assert.match(result.accent, /^hsl\(0 58%/);
});

test("uses amber for grayscale pixel fixtures", () => {
  assert.deepEqual(accentFromPixels(new Uint8ClampedArray([120, 120, 120, 255, 20, 20, 20, 255, 220, 220, 220, 255])), { accent: "#dfa04f", bright: "#f0bd77" });
});
