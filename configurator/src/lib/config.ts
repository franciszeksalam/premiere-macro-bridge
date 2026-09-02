import { ActionRegistry, type Issue } from "./registry";
import type { Action, ActionEntry, ActionType, BridgeConfig } from "./types";

/** action.sh passes the id through a shell string, so keep the charset narrow. */
const ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Ids in the order the user arranged them. Anything the order list forgot is
 * appended, anything it still names but that no longer exists is dropped, so a
 * hand-edited config can never hide an action from the GUI.
 */
export function orderedIds(config: BridgeConfig): string[] {
  const present = Object.keys(config.actions ?? {});
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of config.actionOrder ?? []) {
    if (present.includes(id) && !seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }
  for (const id of present) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

export function entriesOfType(config: BridgeConfig, type: ActionType): ActionEntry[] {
  return orderedIds(config)
    .filter((id) => config.actions[id]?.type === type)
    .map((id) => ({ id, action: config.actions[id] }));
}

export function withOrder(config: BridgeConfig): BridgeConfig {
  return { ...config, actionOrder: orderedIds(config) };
}

export function upsertAction(config: BridgeConfig, id: string, action: Action): BridgeConfig {
  const actions = { ...config.actions, [id]: action };
  const order = orderedIds({ ...config, actions });
  return { ...config, actions, actionOrder: order };
}

export function removeAction(config: BridgeConfig, id: string): BridgeConfig {
  const actions = { ...config.actions };
  delete actions[id];
  return { ...config, actions, actionOrder: orderedIds({ ...config, actions }) };
}

/** Moves `id` to sit at `targetIndex` within its own category, leaving other categories alone. */
export function reorderWithin(config: BridgeConfig, type: ActionType, id: string, targetIndex: number): BridgeConfig {
  const category = entriesOfType(config, type).map((entry) => entry.id);
  const from = category.indexOf(id);
  if (from < 0) return config;
  const clamped = Math.max(0, Math.min(targetIndex, category.length - 1));
  if (from === clamped) return config;
  category.splice(from, 1);
  category.splice(clamped, 0, id);

  // Rebuild the global order by replaying it, substituting this category's slots.
  let cursor = 0;
  const rebuilt = orderedIds(config).map((existing) => {
    if (config.actions[existing]?.type !== type) return existing;
    const next = category[cursor];
    cursor += 1;
    return next;
  });
  return { ...config, actionOrder: rebuilt };
}

export interface DraftValidation {
  ok: boolean;
  issues: Issue[];
  byAction: Record<string, Issue[]>;
}

/**
 * The bridge's own validator plus the two checks it cannot make from a webview:
 * id charset, and whether referenced files are still on disk.
 */
export function validateDraft(config: BridgeConfig, missingPaths: Set<string>): DraftValidation {
  const result = ActionRegistry.validateConfig(config, { checkFiles: false });
  const issues: Issue[] = [...result.issues];

  for (const [id, action] of Object.entries(config.actions ?? {})) {
    if (!ID_PATTERN.test(id)) {
      issues.push({ code: "INVALID_ACTION_CONFIG", actionId: id, message: `action id "${id}" uses unsupported characters` });
    }
    if ((action.type === "sfx" || action.type === "mogrt") && action.path && missingPaths.has(action.path)) {
      issues.push({ code: "FILE_NOT_FOUND", actionId: id, message: action.path });
    }
  }

  const byAction: Record<string, Issue[]> = {};
  for (const issue of issues) {
    if (!issue.actionId) continue;
    (byAction[issue.actionId] ??= []).push(issue);
  }
  return { ok: issues.length === 0, issues, byAction };
}

/** Which action already owns this combination, ignoring `exceptId` (the one being edited). */
export function hotkeyOwner(config: BridgeConfig, canonical: string, exceptId?: string): ActionEntry | null {
  const target = ActionRegistry.normalizeHotkey(canonical);
  if (!target.ok) return null;
  for (const id of orderedIds(config)) {
    if (id === exceptId) continue;
    const action = config.actions[id];
    if (!action?.hotkey) continue;
    const existing = ActionRegistry.normalizeHotkey(action.hotkey);
    if (existing.ok && existing.canonical === target.canonical) return { id, action };
  }
  return null;
}

/** Key order matters only for how the file reads to a human; the bridge does not care. */
export function serializeConfig(config: BridgeConfig): string {
  const { actions, actionOrder, ...rest } = config;
  const ordered: Record<string, Action> = {};
  for (const id of orderedIds(config)) ordered[id] = actions[id];
  return `${JSON.stringify({ ...rest, actions: ordered, actionOrder }, null, 2)}\n`;
}

export function collectPaths(config: BridgeConfig): string[] {
  const paths = new Set<string>();
  for (const action of Object.values(config.actions ?? {})) {
    if (action.path) paths.add(action.path);
    if (action.iconPath) paths.add(action.iconPath);
  }
  return [...paths];
}

/**
 * Keeps the informative end of a long path. Done here rather than with CSS
 * direction tricks, which reorder trailing punctuation ("config.json/").
 */
export function shortenPath(filePath: string, maxLength = 72): string {
  if (filePath.length <= maxLength) return filePath;
  return `…${filePath.slice(filePath.length - maxLength + 1)}`;
}

export function basename(filePath: string | undefined): string {
  if (!filePath) return "";
  const parts = filePath.split("/");
  return parts[parts.length - 1] || filePath;
}
