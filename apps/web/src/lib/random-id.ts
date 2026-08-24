// crypto.randomUUID() only exists in secure contexts (HTTPS, or localhost
// specifically) — accessing the dev server from another device over plain
// HTTP (e.g. http://192.168.x.x:3000 on a phone, per RUN.md) loses that
// localhost exemption, so it's simply undefined there even though nothing
// else about the page is broken. crypto.getRandomValues() has no such
// restriction, so build a UUID v4 from it instead of failing outright.
export function randomId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // No Web Crypto at all — extremely unlikely in any real browser, but
  // still unique enough for these call sites (transient client-side ids).
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
