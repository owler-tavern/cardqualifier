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
