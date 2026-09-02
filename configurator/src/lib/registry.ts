// The bridge's own validator, reused rather than reimplemented. js/action-registry.js
// is a UMD module: with no CommonJS `module` in scope it assigns its API to the
// global instead, which is what happens here. Keeping one copy of the rules is the
// point — the GUI must reject exactly what the Carbon helper would refuse to
// register, and accept exactly what it would.
import "../../../js/action-registry.js";

export type IssueCode =
  | "INVALID_ACTION_CONFIG"
  | "UNKNOWN_ACTION_TYPE"
  | "UNKNOWN_ACTION"
  | "DUPLICATE_HOTKEY"
  | "FILE_NOT_FOUND";

export interface Issue {
  code: IssueCode | string;
  message: string;
  actionId?: string;
  hotkey?: string;
}

export interface ParsedHotkey {
  ok: true;
  canonical: string;
  key: string;
  modifiers: { ctrl: boolean; alt: boolean; shift: boolean; cmd: boolean };
}

export type HotkeyResult = ParsedHotkey | { ok: false; issue: Issue };

export interface ActionValidation {
  ok: boolean;
  issues: Issue[];
  hotkey: ParsedHotkey | null;
  hotkeyConflict?: boolean;
}

export interface ConfigValidation {
  ok: boolean;
  issues: Issue[];
  actions: Record<string, ActionValidation>;
}

interface RegistryApi {
  normalizeHotkey(value: string): HotkeyResult;
  validateAction(actionId: string, action: unknown, options?: { checkFiles?: boolean }): ActionValidation;
  validateConfig(config: unknown, options?: { checkFiles?: boolean }): ConfigValidation;
  commandForAction(config: unknown, actionId: string, options?: { checkFiles?: boolean }): Record<string, unknown>;
}

const registry = (globalThis as unknown as { PMBActionRegistry?: RegistryApi }).PMBActionRegistry;

if (!registry) {
  throw new Error("js/action-registry.js did not initialise; the GUI cannot validate without it");
}

// There is no filesystem in the webview, so the shared validator's existence check
// is always skipped here. Missing files are reported separately, by asking Rust.
export const ActionRegistry: RegistryApi = registry;
