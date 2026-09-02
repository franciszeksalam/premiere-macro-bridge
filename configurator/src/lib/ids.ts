/**
 * Action ids stay out of the user's way, but they are the key the helper sends to
 * the bridge, so they have to be stable and safe for a URL-free JSON key.
 * "Whoosh Impact 01" -> "whooshImpact01"
 */
export function idFromLabel(label: string, taken: Iterable<string>): string {
  const words = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  let base = words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");

  if (!base) base = "action";
  if (/^[0-9]/.test(base)) base = `action${base.charAt(0).toUpperCase()}${base.slice(1)}`;

  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
