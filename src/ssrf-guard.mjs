export function isBlockedHost(hostname) {
  const h = String(hostname).toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  // IPv6 literals contain a colon; only then apply IPv6 rules, so ordinary
  // domains that merely start with "fc"/"fd"/"fe80" (e.g. fc2.com) aren't blocked.
  if (h.includes(":")) {
    if (h === "::1") return true;                                                     // loopback
    if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true; // ULA / link-local
    return false;
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]); const b = Number(m[2]);
    if (a === 0 || a === 127) return true;                 // this-host / loopback
    if (a === 10) return true;                             // private
    if (a === 172 && b >= 16 && b <= 31) return true;      // private
    if (a === 192 && b === 168) return true;               // private
    if (a === 169 && b === 254) return true;               // link-local
  }
  return false;
}

export function isBlockedUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return true; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return true;
  return isBlockedHost(u.hostname);
}