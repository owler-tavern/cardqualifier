const READY = new Set(["Good", "Excellent"]);
const MESSAGES = {
  Excellent: "Excellent — this card is ready to ship.",
  Good: "Good to ship. Export when you're happy, or keep polishing below.",
  Mixed: "Getting there — clear the queue to reach shippable.",
  Weak: "Early draft — start with the blockers below.",
};

export function exportReadiness(band) {
  return { ready: READY.has(band), band, message: MESSAGES[band] ?? MESSAGES.Weak };
}
