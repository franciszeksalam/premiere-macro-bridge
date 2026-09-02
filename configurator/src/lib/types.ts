export type ActionType = "effect" | "sfx" | "mogrt";

export const ACTION_TYPES: ActionType[] = ["effect", "sfx", "mogrt"];

export const TYPE_LABELS: Record<ActionType, string> = {
  effect: "Effect",
  sfx: "SFX",
  mogrt: "MOGRT"
};

/** Tab headings read as categories; the singular is for buttons like "Add Effect". */
export const TYPE_TABS: Record<ActionType, string> = {
  effect: "EFFECTS",
  sfx: "SFX",
  mogrt: "MOGRT"
};

/** One entry of the bridge's `actions` object. */
export interface Action {
  type: ActionType;
  label?: string;
  hotkey?: string;
  /** effect only */
  premiereName?: string;
  /** sfx and mogrt only */
  path?: string;
  /** mogrt only */
  durationSeconds?: number;
  /** Configurator metadata. The bridge ignores it. */
  iconPath?: string;
}

/**
 * The bridge reads `port` and `actions`. `actionOrder` is added by this app and
 * ignored by both the helper and the CEP side, so it cannot affect playback.
 */
export interface BridgeConfig {
  port?: number;
  actions: Record<string, Action>;
  actionOrder?: string[];
  [extra: string]: unknown;
}

export interface ActionEntry {
  id: string;
  action: Action;
}
