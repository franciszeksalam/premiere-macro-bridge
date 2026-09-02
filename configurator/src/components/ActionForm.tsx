import { useCallback, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { basename, hotkeyOwner, orderedIds } from "../lib/config";
import { idFromLabel } from "../lib/ids";
import { ActionRegistry } from "../lib/registry";
import { TYPE_LABELS, type Action, type ActionType, type BridgeConfig } from "../lib/types";

interface Props {
  type: ActionType;
  config: BridgeConfig;
  editingId: string | null;
  onCancel: () => void;
  onSubmit: (id: string, action: Action) => void;
}

const AUDIO_EXTENSIONS = ["wav", "mp3", "aif", "aiff", "m4a"];
const ICON_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];

export function ActionForm({ type, config, editingId, onCancel, onSubmit }: Props) {
  const existing = editingId ? config.actions[editingId] : undefined;

  const [label, setLabel] = useState(existing?.label ?? "");
  const [premiereName, setPremiereName] = useState(existing?.premiereName ?? "");
  const [path, setPath] = useState(existing?.path ?? "");
  const [durationSeconds, setDurationSeconds] = useState(
    existing?.durationSeconds !== undefined ? String(existing.durationSeconds) : "5"
  );
  const [hotkey, setHotkey] = useState<string | undefined>(existing?.hotkey);
  const [iconPath, setIconPath] = useState(existing?.iconPath ?? "");
  const [error, setError] = useState<string | null>(null);

  // An edit keeps its id: the helper sends the id, so changing it would silently
  // orphan any Ulanzi button already pointing at this action.
  const actionId = useMemo(
    () => editingId ?? idFromLabel(label || TYPE_LABELS[type], orderedIds(config)),
    [editingId, label, type, config]
  );

  const findConflict = useCallback(
    (canonical: string) => {
      const owner = hotkeyOwner(config, canonical, editingId ?? undefined);
      return owner ? owner.action.label || owner.id : null;
    },
    [config, editingId]
  );

  const chooseFile = async (kind: "media" | "icon") => {
    const isIcon = kind === "icon";
    const selected = await open({
      multiple: false,
      directory: false,
      title: isIcon ? "Choose icon or GIF" : type === "sfx" ? "Choose audio file" : "Choose MOGRT",
      filters: isIcon
        ? [{ name: "Images", extensions: ICON_EXTENSIONS }]
        : type === "sfx"
          ? [{ name: "Audio", extensions: AUDIO_EXTENSIONS }]
          : [{ name: "Motion Graphics Template", extensions: ["mogrt"] }]
    });
    if (typeof selected !== "string") return;
    if (isIcon) setIconPath(selected);
    else {
      setPath(selected);
      // The filename is a better first guess at a label than an empty field.
      if (!label.trim()) setLabel(basename(selected).replace(/\.[^.]+$/, ""));
    }
  };

  const submit = () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError("Label jest wymagany.");
      return;
    }

    const action: Action = { type, label: trimmedLabel };
    if (type === "effect") action.premiereName = premiereName.trim();
    else action.path = path;
    if (type === "mogrt") action.durationSeconds = Number(durationSeconds);
    if (hotkey) action.hotkey = hotkey;
    if (iconPath) action.iconPath = iconPath;

    // The bridge's own rules, not a second copy of them.
    const validation = ActionRegistry.validateAction(actionId, action, { checkFiles: false });
    if (!validation.ok) {
      setError(validation.issues[0].message);
      return;
    }
    if (hotkey) {
      const conflict = findConflict(hotkey);
      if (conflict) {
        setError(`Ten skrót jest już przypisany do "${conflict}".`);
        return;
      }
    }
    onSubmit(actionId, action);
  };

  const isNew = editingId === null;
  const iconSource = iconPath ? convertFileSrc(iconPath) : "";

  return (
    <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true">
        <header>
          {isNew ? "Add" : "Edit"} {TYPE_LABELS[type]}
        </header>
        <div className="body">
          <div className="field">
            <label>Label</label>
            <input
              autoFocus
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={type === "effect" ? "Gaussian Blur" : type === "sfx" ? "Whoosh 01" : "Question Box"}
            />
            <span className="note">id: {actionId}</span>
          </div>

          {type === "effect" ? (
            <div className="field">
              <label>Premiere Effect Name</label>
              <input
                value={premiereName}
                onChange={(event) => setPremiereName(event.target.value)}
                placeholder="Gaussian Blur"
              />
              <span className="note">Musi się dokładnie zgadzać z nazwą efektu w panelu Effects.</span>
            </div>
          ) : (
            <div className="field">
              <label>{type === "sfx" ? "Audio file" : "MOGRT file"}</label>
              <div className="file-row">
                <span className="name">{path ? basename(path) : <span className="note">Nie wybrano pliku</span>}</span>
                <button type="button" className="tiny" onClick={() => void chooseFile("media")}>
                  Choose File
                </button>
              </div>
              {path && <span className="note path">{path}</span>}
            </div>
          )}

          {type === "mogrt" && (
            <div className="field">
              <label>Duration Seconds</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={durationSeconds}
                onChange={(event) => setDurationSeconds(event.target.value)}
              />
              <span className="note">
                Bridge sprawdza ten zakres na obu ścieżkach, zanim wstawi MOGRT-a.
              </span>
            </div>
          )}

          <HotkeyRecorder value={hotkey} onChange={setHotkey} findConflict={findConflict} />

          <div className="field">
            <label>Icon / GIF (opcjonalnie)</label>
            <div className="file-row">
              {iconSource && <img className="row-icon" src={iconSource} alt="" />}
              <span className="name">
                {iconPath ? basename(iconPath) : <span className="note">Brak ikony</span>}
              </span>
              <button type="button" className="tiny" onClick={() => void chooseFile("icon")}>
                Choose Icon / GIF
              </button>
              {iconPath && (
                <button type="button" className="tiny ghost" onClick={() => setIconPath("")}>
                  Clear
                </button>
              )}
            </div>
            <span className="note">Tylko dla Ulanzi Map. Premiere tego nie używa.</span>
          </div>
        </div>
        <footer>
          {error && <span className="error footer-error">{error}</span>}
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={submit}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
