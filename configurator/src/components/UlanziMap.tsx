import { convertFileSrc } from "@tauri-apps/api/core";
import { entriesOfType } from "../lib/config";
import { displayHotkey } from "../lib/hotkey";
import { ACTION_TYPES, TYPE_LABELS, type BridgeConfig } from "../lib/types";

/**
 * A read-only picture of the mapping, laid out like a deck, so the same shortcuts
 * can be typed into Ulanzi Studio. Nothing here talks to the device.
 */
export function UlanziMap({ config }: { config: BridgeConfig }) {
  const groups = ACTION_TYPES.map((type) => ({ type, entries: entriesOfType(config, type) })).filter(
    (group) => group.entries.length > 0
  );

  if (groups.length === 0) {
    return <div className="empty">Brak akcji do pokazania.</div>;
  }

  return (
    <>
      <div className="toolbar">
        <span className="hint" style={{ marginLeft: 0 }}>
          Ustaw te same skróty w Ulanzi Studio jako Keyboard Shortcut. Aplikacja nie łączy się z urządzeniem.
        </span>
      </div>
      {groups.map(({ type, entries }) => (
        <div className="deck-group" key={type}>
          <h3>
            {TYPE_LABELS[type]} · {entries.length}
          </h3>
          <div className="deck">
            {entries.map(({ id, action }) => (
              <div className="tile" key={id}>
                <div className="tile-art">
                  {action.iconPath ? (
                    <img src={convertFileSrc(action.iconPath)} alt="" />
                  ) : (
                    <span className="placeholder">{TYPE_LABELS[type]}</span>
                  )}
                </div>
                <div className="tile-label">{action.label || id}</div>
                <span className={action.hotkey ? "kbd" : "kbd none"}>
                  {action.hotkey ? displayHotkey(action.hotkey) : "no hotkey"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
