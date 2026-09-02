import { useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { basename, entriesOfType } from "../lib/config";
import { displayHotkey } from "../lib/hotkey";
import type { Issue } from "../lib/registry";
import { TYPE_LABELS, type ActionType, type BridgeConfig } from "../lib/types";

interface Props {
  type: ActionType;
  config: BridgeConfig;
  issuesByAction: Record<string, Issue[]>;
  busyActionId: string | null;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  onReorder: (id: string, targetIndex: number) => void;
}

export function ActionList({
  type,
  config,
  issuesByAction,
  busyActionId,
  onAdd,
  onEdit,
  onDelete,
  onTest,
  onReorder
}: Props) {
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const entries = useMemo(() => entriesOfType(config, type), [config, type]);
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? entries.filter(({ id, action }) =>
        [action.label, id, action.premiereName, action.path].some((field) =>
          (field ?? "").toLowerCase().includes(needle)
        )
      )
    : entries;

  // Dragging is disabled while searching: the visible rows are not the real
  // positions, so a drop index would land somewhere the user did not point at.
  const canReorder = !needle;

  return (
    <>
      <div className="toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${TYPE_LABELS[type]}…`}
        />
        <button className="primary" onClick={onAdd}>
          + Add {TYPE_LABELS[type]}
        </button>
        <span className="hint">Test wykonuje akcję w aktualnie otwartym projekcie Premiere.</span>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          {entries.length === 0 ? `Brak akcji typu ${TYPE_LABELS[type]}.` : "Nic nie pasuje do wyszukiwania."}
        </div>
      ) : (
        <div className="rows">
          {visible.map(({ id, action }, index) => {
            const issues = issuesByAction[id] ?? [];
            const classes = ["row"];
            if (issues.length) classes.push("invalid");
            if (dragId === id) classes.push("dragging");
            if (canReorder && dropIndex === index && dragId && dragId !== id) {
              classes.push(entries.findIndex((entry) => entry.id === dragId) > index ? "drop-before" : "drop-after");
            }

            return (
              <div
                key={id}
                className={classes.join(" ")}
                draggable={canReorder}
                onDragStart={(event) => {
                  setDragId(id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", id);
                }}
                onDragOver={(event) => {
                  if (!canReorder || !dragId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropIndex(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (canReorder && dragId && dragId !== id) onReorder(dragId, index);
                  setDragId(null);
                  setDropIndex(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropIndex(null);
                }}
              >
                {canReorder && (
                  <span className="grip" title="Przeciągnij, aby zmienić kolejność">
                    ⠿
                  </span>
                )}

                {action.iconPath && <img className="row-icon" src={convertFileSrc(action.iconPath)} alt="" />}

                <div className="row-main">
                  <div className="row-title">{action.label || id}</div>
                  {issues.length > 0 ? (
                    <div className="row-error">
                      {issues.map((issue) => `${issue.code}: ${issue.message}`).join(" · ")}
                    </div>
                  ) : type === "effect" ? (
                    <div className="row-sub">Premiere: {action.premiereName}</div>
                  ) : (
                    <div className="row-sub" title={action.path}>
                      {basename(action.path)}
                    </div>
                  )}
                </div>

                {type === "mogrt" && action.durationSeconds !== undefined && (
                  <span className="duration">{action.durationSeconds}s</span>
                )}

                <span className={action.hotkey ? "kbd" : "kbd none"}>
                  {action.hotkey ? displayHotkey(action.hotkey) : "—"}
                </span>

                <div className="row-actions">
                  <button className="tiny" disabled={busyActionId === id} onClick={() => onTest(id)}>
                    {busyActionId === id ? "…" : "Test"}
                  </button>
                  <button className="tiny" onClick={() => onEdit(id)}>
                    Edit
                  </button>
                  <button className="tiny danger" onClick={() => onDelete(id)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
