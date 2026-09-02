import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionForm } from "./components/ActionForm";
import { ActionList } from "./components/ActionList";
import { Confirm } from "./components/Confirm";
import { Toasts, type Toast } from "./components/Toasts";
import { UlanziMap } from "./components/UlanziMap";
import * as api from "./lib/api";
import {
  collectPaths,
  entriesOfType,
  removeAction,
  reorderWithin,
  serializeConfig,
  shortenPath,
  upsertAction,
  validateDraft,
  withOrder
} from "./lib/config";
import { BRIDGE_OFFLINE_HINT, explain, successMessage } from "./lib/messages";
import { ACTION_TYPES, TYPE_TABS, type Action, type ActionType, type BridgeConfig } from "./lib/types";

type Tab = ActionType | "ulanzi";

const STATUS_INTERVAL_MS = 5000;
// launchd reports a restarted agent as "xpcproxy" for a moment before it settles
// on "running". Polling immediately after a reload would flash a false Offline.
const STATUS_SETTLE_MS = 2000;

export function App() {
  const [config, setConfig] = useState<BridgeConfig | null>(null);
  const [configPath, setConfigPath] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("effect");
  const [missingPaths, setMissingPaths] = useState<Set<string>>(new Set());
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null);
  const [helperOnline, setHelperOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ type: ActionType; id: string | null } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((kind: Toast["kind"], text: string) => {
    const id = (toastId.current += 1);
    setToasts((current) => [...current, { id, kind, text }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 6000);
  }, []);

  const refreshMissingPaths = useCallback(async (next: BridgeConfig) => {
    const paths = collectPaths(next);
    if (paths.length === 0) {
      setMissingPaths(new Set());
      return;
    }
    const existence = await api.pathsExist(paths);
    setMissingPaths(new Set(paths.filter((path) => !existence[path])));
  }, []);

  const load = useCallback(async () => {
    try {
      const payload = await api.readConfig();
      const parsed = JSON.parse(payload.text) as BridgeConfig;
      if (!parsed.actions || typeof parsed.actions !== "object") {
        throw new Error("config.json nie zawiera obiektu actions");
      }
      const normalized = withOrder(parsed);
      setConfig(normalized);
      setConfigPath(payload.path);
      setLoadError(null);
      await refreshMissingPaths(normalized);
    } catch (error) {
      setLoadError(String(error));
    }
  }, [refreshMissingPaths]);

  const refreshStatus = useCallback(async () => {
    const [bridge, helper] = await Promise.all([api.bridgeHealth(), api.helperRunning()]);
    setBridgeOnline(bridge);
    setHelperOnline(helper);
  }, []);

  const refreshStatusAfterRestart = useCallback(() => {
    window.setTimeout(() => void refreshStatus(), STATUS_SETTLE_MS);
  }, [refreshStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), STATUS_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refreshStatus]);

  const validation = useMemo(
    () => (config ? validateDraft(config, missingPaths) : { ok: true, issues: [], byAction: {} }),
    [config, missingPaths]
  );

  /**
   * One path for every change: validate, back up, write atomically, then reload the
   * helper. A failed reload never rolls the file back — a valid config on disk is
   * always better than losing the edit.
   */
  const persist = useCallback(
    async (next: BridgeConfig, options: { reload?: boolean; note: string }) => {
      const check = validateDraft(next, missingPaths);
      const blocking = check.issues.filter(
        (issue) => issue.code === "DUPLICATE_HOTKEY" || issue.code === "UNKNOWN_ACTION_TYPE" || issue.code === "INVALID_ACTION_CONFIG"
      );
      if (blocking.length > 0) {
        notify("err", explain(blocking[0].code, blocking[0].message));
        return false;
      }

      setBusy(true);
      try {
        await api.saveConfig(serializeConfig(next));
        setConfig(next);
        await refreshMissingPaths(next);

        if (options.reload === false) {
          notify("ok", options.note);
          return true;
        }
        const reload = await api.reloadHelper();
        if (!reload.ok) {
          notify("err", `Zapisano, ale reload helpera się nie powiódł: ${reload.stderr || reload.stdout}`);
          return true;
        }
        notify("ok", options.note);
        refreshStatusAfterRestart();
        return true;
      } catch (error) {
        notify("err", `Nie udało się zapisać: ${String(error)}`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [missingPaths, notify, refreshMissingPaths, refreshStatusAfterRestart]
  );

  const handleSubmit = useCallback(
    (id: string, action: Action) => {
      if (!config) return;
      setEditing(null);
      void persist(upsertAction(config, id, action), { note: "Saved & reloaded" });
    },
    [config, persist]
  );

  const handleDelete = useCallback(() => {
    if (!config || !deleting) return;
    const id = deleting;
    setDeleting(null);
    void persist(removeAction(config, id), { note: "Usunięto i przeładowano" });
  }, [config, deleting, persist]);

  const handleReorder = useCallback(
    (type: ActionType, id: string, targetIndex: number) => {
      if (!config) return;
      // Order is configurator metadata; the helper's mapping is unchanged, so there
      // is nothing to reload.
      void persist(reorderWithin(config, type, id, targetIndex), { reload: false, note: "Kolejność zapisana" });
    },
    [config, persist]
  );

  const handleTest = useCallback(
    async (id: string) => {
      if (!config) return;
      const action = config.actions[id];
      const label = action?.label || id;
      setBusyActionId(id);
      try {
        const result = await api.runAction(id);
        let payload: { ok?: boolean; error?: string; message?: string } | null = null;
        try {
          payload = JSON.parse(result.stdout);
        } catch {
          payload = null;
        }
        if (payload?.ok) {
          notify("ok", successMessage(action, label));
        } else if (payload?.error) {
          notify("err", explain(payload.error, payload.message));
        } else if (!result.ok) {
          notify("err", bridgeOnline === false ? BRIDGE_OFFLINE_HINT : result.stderr || result.stdout || "Bridge nie odpowiedział.");
        } else {
          notify("err", result.stdout || "Bridge nie odpowiedział.");
        }
      } catch (error) {
        notify("err", String(error));
      } finally {
        setBusyActionId(null);
      }
    },
    [bridgeOnline, config, notify]
  );

  const handleReload = useCallback(async () => {
    setBusy(true);
    try {
      const result = await api.reloadHelper();
      notify(result.ok ? "ok" : "err", result.ok ? "Config reloaded" : result.stderr || result.stdout);
      await load();
      refreshStatusAfterRestart();
    } finally {
      setBusy(false);
    }
  }, [load, notify, refreshStatusAfterRestart]);

  const handleRestartHelper = useCallback(async () => {
    setBusy(true);
    try {
      const result = await api.restartHelper();
      notify(result.ok ? "ok" : "err", result.ok ? "Helper restarted" : result.stderr || result.stdout);
      refreshStatusAfterRestart();
    } finally {
      setBusy(false);
    }
  }, [notify, refreshStatusAfterRestart]);

  if (loadError) {
    return (
      <div className="app">
        <div className="titlebar" data-tauri-drag-region />
        <div className="content">
          <div className="empty">
            <div className="error">Nie udało się wczytać config.json</div>
            <div className="note" style={{ marginTop: 8 }}>{loadError}</div>
            <button style={{ marginTop: 14 }} onClick={() => void load()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="app">
        <div className="titlebar" data-tauri-drag-region />
        <div className="content">
          <div className="empty">Wczytywanie…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="titlebar" data-tauri-drag-region />

      <div className="topbar" data-tauri-drag-region>
        <div className="brand">
          Premiere Macro Bridge
          <small title={configPath}>{shortenPath(configPath)}</small>
        </div>

        <div className="statuses">
          <span className="status">
            <span className={`dot ${bridgeOnline === null ? "" : bridgeOnline ? "on" : "off"}`} />
            Bridge {bridgeOnline === null ? "…" : bridgeOnline ? "Connected" : "Offline"}
          </span>
          <span className="status">
            <span className={`dot ${helperOnline === null ? "" : helperOnline ? "on" : "off"}`} />
            Helper {helperOnline === null ? "…" : helperOnline ? "Running" : "Offline"}
          </span>
          <div className="topbar-actions">
            {helperOnline === false && (
              <button className="tiny" disabled={busy} onClick={() => void handleRestartHelper()}>
                Start / Restart
              </button>
            )}
            <button className="tiny" disabled={busy} onClick={() => void handleReload()}>
              Reload Config
            </button>
            <button className="tiny" onClick={() => void api.revealConfig()}>
              Open Config Folder
            </button>
          </div>
        </div>
      </div>

      <div className="tabs">
        {ACTION_TYPES.map((type) => (
          <button key={type} className={`tab ${tab === type ? "active" : ""}`} onClick={() => setTab(type)}>
            {TYPE_TABS[type]}
            <span className="count">{entriesOfType(config, type).length}</span>
          </button>
        ))}
        <button className={`tab ${tab === "ulanzi" ? "active" : ""}`} onClick={() => setTab("ulanzi")}>
          ULANZI MAP
        </button>
      </div>

      <div className="content">
        {tab === "ulanzi" ? (
          <UlanziMap config={config} />
        ) : (
          <ActionList
            type={tab}
            config={config}
            issuesByAction={validation.byAction}
            busyActionId={busyActionId}
            onAdd={() => setEditing({ type: tab, id: null })}
            onEdit={(id) => setEditing({ type: tab, id })}
            onDelete={(id) => setDeleting(id)}
            onTest={(id) => void handleTest(id)}
            onReorder={(id, index) => handleReorder(tab, id, index)}
          />
        )}
      </div>

      {editing && (
        <ActionForm
          type={editing.type}
          config={config}
          editingId={editing.id}
          onCancel={() => setEditing(null)}
          onSubmit={handleSubmit}
        />
      )}

      {deleting && (
        <Confirm
          message={`Usunąć "${config.actions[deleting]?.label || deleting}"?`}
          detail="Usuwane jest tylko mapowanie w konfiguracji. Plik na dysku zostaje nietknięty."
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}
