import { useEffect, useState } from "react";
import { canonicalFromEvent, displayHotkey, spellHotkey } from "../lib/hotkey";

interface Props {
  value?: string;
  onChange: (canonical: string | undefined) => void;
  /** Returns the label of the action already using this combination, if any. */
  findConflict: (canonical: string) => string | null;
}

const MODIFIER_CODE = /^(Control|Alt|Shift|Meta)(Left|Right)$/;

function liveModifiers(event: KeyboardEvent): string {
  let text = "";
  if (event.ctrlKey) text += "⌃";
  if (event.altKey) text += "⌥";
  if (event.shiftKey) text += "⇧";
  if (event.metaKey) text += "⌘";
  return text;
}

export function HotkeyRecorder({ value, onChange, findConflict }: Props) {
  const [recording, setRecording] = useState(false);
  const [live, setLive] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.code === "Escape") {
        setRecording(false);
        setLive("");
        return;
      }
      // Modifiers on their own only update the preview; we wait for a real key.
      if (MODIFIER_CODE.test(event.code)) {
        setLive(liveModifiers(event));
        return;
      }

      const result = canonicalFromEvent(event);
      if (!result.ok) {
        setError(result.message);
        setLive(liveModifiers(event));
        return;
      }
      const conflict = findConflict(result.value.canonical);
      if (conflict) {
        setError(`Ten skrót jest już przypisany do "${conflict}".`);
        return;
      }
      setError(null);
      setLive("");
      setRecording(false);
      onChange(result.value.canonical);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      setLive(liveModifiers(event));
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [recording, findConflict, onChange]);

  const fieldText = recording ? live || "Press shortcut…" : value ? displayHotkey(value) : "No hotkey";
  const fieldClass = ["recorder-field", recording ? "recording" : "", !recording && !value ? "empty" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="field">
      <label>Hotkey</label>
      <div className="recorder">
        <button
          type="button"
          className={fieldClass}
          onClick={() => {
            setError(null);
            setRecording((was) => !was);
          }}
        >
          {fieldText}
        </button>
        {recording ? (
          <button type="button" className="tiny" onClick={() => setRecording(false)}>
            Cancel
          </button>
        ) : (
          <button type="button" className="tiny" onClick={() => setRecording(true)}>
            {value ? "Re-record" : "Record Hotkey"}
          </button>
        )}
        {value && !recording && (
          <button
            type="button"
            className="tiny ghost"
            onClick={() => {
              setError(null);
              onChange(undefined);
            }}
          >
            Clear
          </button>
        )}
      </div>
      {error ? (
        <span className="error">{error}</span>
      ) : (
        <span className="note">
          {recording
            ? "Escape anuluje nagrywanie."
            : value
              ? spellHotkey(value)
              : "Akcja bez skrótu działa tylko przez Test."}
        </span>
      )}
    </div>
  );
}
