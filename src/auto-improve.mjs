import { mergeFindings } from "./merge-findings.mjs";
import { isDraftableField } from "./ai-review.mjs";

export const AUTO_IMPROVE_TARGET = 70;
export const AUTO_IMPROVE_CAP = 15;

export function pickNextFix(result, appliedIds, targetModel = "any") {
  if (result.total >= AUTO_IMPROVE_TARGET) return { done: true, status: "reached" };
  const plan = mergeFindings(result.reviewFindings, { targetModel, appliedFindingIds: appliedIds, gateOpen: true });
  const candidates = [...plan.blockers, ...plan.improvements];
  if (!candidates.length) return { done: true, status: "exhausted" };
  const card = candidates.find((c) => c.fixTemplate || isDraftableField(c.field));
  if (!card) return { done: true, status: "stuck" };
  return { done: false, card };
}

export async function autoImproveCard({ text, applied = [], ledger = [], targetModel = "any",
    draftField, score, apply, cap = AUTO_IMPROVE_CAP, shouldStop }) {
  applied = [...applied];
  ledger = [...ledger];
  let result = score(text);
  for (let step = 0; step < cap; step++) {
    if (shouldStop && shouldStop()) return { text, applied, ledger, result, status: "cancelled" };
    const pick = pickNextFix(result, applied, targetModel);
    if (pick.done) return { text, applied, ledger, result, status: pick.status };
    const card = pick.card;
    const ids = card.findings.map((f) => f.id);
    let draft = card.fixTemplate || null;
    if (!draft) draft = await draftField(text, card);
    if (!draft) { applied.push(...ids); continue; }
    text = apply(text, { field: card.field, draft });
    applied.push(...ids);
    result = score(text);
    ledger.push(`+${String(card.title || card.field).toLowerCase()} → ${result.total}`);
  }
  return { text, applied, ledger, result, status: result.total >= AUTO_IMPROVE_TARGET ? "reached" : "capped" };
}
