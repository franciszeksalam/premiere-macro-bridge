import { ActionRegistry } from "./registry";

export interface RecordedHotkey {
  canonical: string;
  display: string;
}

/**
 * Physical key, taken from `event.code` rather than `event.key`. On macOS Option
 * rewrites `key` (Option+1 arrives as "¡"), while `code` stays "Digit1", which is
 * also what the Carbon helper's keycode table is built from.
 */
export function keyFromCode(code: string): string | null {
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  return null;
}

const SYMBOLS: Record<string, string> = {
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  cmd: "⌘"
};

/** "ctrl+alt+shift+4" -> "⌃⌥⇧4" */
export function displayHotkey(canonical: string | undefined): string {
  if (!canonical) return "";
  const parsed = ActionRegistry.normalizeHotkey(canonical);
  if (!parsed.ok) return canonical;
  const tokens = parsed.canonical.split("+");
  const key = tokens.pop() ?? "";
  return tokens.map((token) => SYMBOLS[token] ?? token).join("") + key.toUpperCase();
}

/** "ctrl+alt+shift+4" -> "Control + Option + Shift + 4" */
export function spellHotkey(canonical: string | undefined): string {
  if (!canonical) return "No hotkey";
  const parsed = ActionRegistry.normalizeHotkey(canonical);
  if (!parsed.ok) return canonical;
  const names: Record<string, string> = {
    ctrl: "Control",
    alt: "Option",
    shift: "Shift",
    cmd: "Command"
  };
  const tokens = parsed.canonical.split("+");
  const key = tokens.pop() ?? "";
  return [...tokens.map((token) => names[token] ?? token), key.toUpperCase()].join(" + ");
}

/**
 * Turns a keydown into the bridge's canonical form, or explains why it cannot.
 * The modifier requirement mirrors the bridge: a bare key would be captured
 * system-wide and would stop that key from typing anywhere.
 */
export function canonicalFromEvent(event: KeyboardEvent): { ok: true; value: RecordedHotkey } | { ok: false; message: string } {
  const key = keyFromCode(event.code);
  if (!key) {
    return { ok: false, message: "Use a letter or a digit from the main keyboard." };
  }
  const tokens: string[] = [];
  if (event.ctrlKey) tokens.push("ctrl");
  if (event.altKey) tokens.push("alt");
  if (event.shiftKey) tokens.push("shift");
  if (event.metaKey) tokens.push("cmd");
  if (!event.ctrlKey && !event.altKey && !event.metaKey) {
    return { ok: false, message: "Add Control, Option, or Command — a bare key would be captured system-wide." };
  }
  tokens.push(key.toLowerCase());
  const canonical = tokens.join("+");
  const parsed = ActionRegistry.normalizeHotkey(canonical);
  if (!parsed.ok) return { ok: false, message: parsed.issue.message };
  return { ok: true, value: { canonical: parsed.canonical, display: displayHotkey(parsed.canonical) } };
}

/** Same combination written a different way still counts as taken. */
export function sameHotkey(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const a = ActionRegistry.normalizeHotkey(left);
  const b = ActionRegistry.normalizeHotkey(right);
  if (!a.ok || !b.ok) return false;
  return a.canonical === b.canonical;
}
